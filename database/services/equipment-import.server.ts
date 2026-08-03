import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray } from "drizzle-orm";

import {
  EQUIPMENT_CATEGORIES,
  MAX_IMPORT_ROWS,
  type EquipmentCategory,
} from "~/lib/constants";
import { looksLikeHeader, normalizeDate, normalizeNumber, parseTable } from "~/lib/tabular";
import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { equipmentRecords, units } from "../schema";

const HEADER_KEYWORDS = ["部屋", "号室", "種別", "種類", "実施", "日付", "型番"];

/** 表記ゆれを吸収して種別を引く。表示名でも内部値でも受け付ける */
const CATEGORY_BY_INPUT = new Map<string, EquipmentCategory>(
  EQUIPMENT_CATEGORIES.flatMap((c) => [
    [c.label, c.value] as const,
    [c.value, c.value] as const,
  ]),
);

export type EquipmentImportRow = {
  lineNumber: number;
  unitCode: string;
  categoryInput: string;
  category: EquipmentCategory | null;
  performedOn: IsoDate | null;
  modelNumber: string | null;
  cost: number | null;
  maker: string | null;
  note: string | null;
  unitId: string | null;
  errors: string[];
};

export type EquipmentImportPreview = {
  rows: EquipmentImportRow[];
  okCount: number;
  errorCount: number;
};

/**
 * 貼り付けられた表を検証する。**この時点では一切書き込まない。**
 *
 * 設備記録は履歴として積むものなので、契約と違い「すでにある」ことは
 * 通常エラーにならない（同じ部屋のエアコンを何度替えてもよい）。
 * ただし部屋・種別・実施日がすべて同じものは、同じファイルを二度取り込んだ
 * 可能性が高いため重複として弾く。
 */
export async function previewEquipmentImport(
  ctx: OrgContext,
  text: string,
): Promise<EquipmentImportPreview> {
  const table = parseTable(text);
  if (table.length === 0) return { rows: [], okCount: 0, errorCount: 0 };

  const body = looksLikeHeader(table[0], HEADER_KEYWORDS) ? table.slice(1) : table;

  const unitRows = await ctx.db
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(eq(units.organizationId, ctx.organizationId));
  const unitByCode = new Map(unitRows.map((u) => [u.code, u.id]));

  const parsed = body.slice(0, MAX_IMPORT_ROWS).map((cells, index) => {
    const [unitCode = "", categoryInput = "", dateRaw = "", modelRaw = "", costRaw = "", makerRaw = "", noteRaw = ""] =
      cells;

    const errors: string[] = [];
    const unitId = unitByCode.get(unitCode.trim()) ?? null;

    if (!unitCode) errors.push("部屋番号がありません");
    else if (!unitId) errors.push(`部屋「${unitCode}」が登録されていません`);

    const category = CATEGORY_BY_INPUT.get(categoryInput.trim()) ?? null;
    if (!categoryInput) errors.push("種別がありません");
    else if (!category) errors.push(`種別「${categoryInput}」がわかりません`);

    const performedOn = normalizeDate(dateRaw);
    if (!dateRaw) errors.push("日付がありません");
    else if (!performedOn) errors.push(`日付「${dateRaw}」を読み取れません`);

    const cost = costRaw ? normalizeNumber(costRaw) : null;
    if (costRaw && cost === null) errors.push(`費用「${costRaw}」を読み取れません`);

    return {
      lineNumber: index + 1,
      unitCode,
      categoryInput,
      category,
      performedOn,
      modelNumber: modelRaw.trim() || null,
      cost,
      maker: makerRaw.trim() || null,
      note: noteRaw.trim() || null,
      unitId,
      errors,
    };
  });

  // 既存の記録と突き合わせて重複を弾く
  const targetUnitIds = [...new Set(parsed.map((r) => r.unitId).filter((id): id is string => !!id))];
  const existing = new Set<string>();
  if (targetUnitIds.length > 0) {
    const rows = await ctx.db
      .select({
        unitId: equipmentRecords.unitId,
        category: equipmentRecords.category,
        performedOn: equipmentRecords.performedOn,
      })
      .from(equipmentRecords)
      .where(
        and(
          eq(equipmentRecords.organizationId, ctx.organizationId),
          inArray(equipmentRecords.unitId, targetUnitIds),
        ),
      );
    for (const r of rows) existing.add(`${r.unitId}:${r.category}:${r.performedOn}`);
  }

  const seen = new Set<string>();
  for (const row of parsed) {
    if (!row.unitId || !row.category || !row.performedOn) continue;
    const key = `${row.unitId}:${row.category}:${row.performedOn}`;
    if (existing.has(key)) row.errors.push("同じ記録がすでにあります");
    else if (seen.has(key)) row.errors.push("同じ記録が複数行にあります");
    seen.add(key);
  }

  return {
    rows: parsed,
    okCount: parsed.filter((r) => r.errors.length === 0).length,
    errorCount: parsed.filter((r) => r.errors.length > 0).length,
  };
}

/**
 * 1文の INSERT に載せられる行数。
 *
 * **D1 は1つのクエリに渡せるバインド変数を100個までに制限している。**
 * equipment_records は1行あたり11カラム（id と created_at/updated_at を含む）なので、
 * 9行で99個、10行で110個となり超過してしまう。
 * まとめて1文で流さず、この単位に分割して batch で実行する。
 */
const ROWS_PER_INSERT = 9;

/** 配列を size ごとに切り分ける */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 検証を通った行だけを取り込む */
export async function commitEquipmentImport(
  ctx: OrgContext,
  text: string,
): Promise<{ imported: number }> {
  const preview = await previewEquipmentImport(ctx, text);
  const valid = preview.rows.filter(
    (r) => r.errors.length === 0 && r.unitId && r.category && r.performedOn,
  );
  if (valid.length === 0) return { imported: 0 };

  const values = valid.map((r) => {
    // 型番を持たない種別（排水管洗浄など）では型番・メーカーを保存しない。
    // 単票の登録と同じ扱いにする
    const hasModel =
      EQUIPMENT_CATEGORIES.find((c) => c.value === r.category)?.hasModel ?? true;
    return {
      organizationId: ctx.organizationId,
      unitId: r.unitId!,
      category: r.category!,
      performedOn: r.performedOn!,
      modelNumber: hasModel ? r.modelNumber : null,
      maker: hasModel ? r.maker : null,
      cost: r.cost,
      note: r.note,
    };
  });

  // まとめて1文で INSERT すると D1 のバインド変数上限を超える（下記参照）
  const writes: BatchItem<"sqlite">[] = chunk(values, ROWS_PER_INSERT).map((part) =>
    ctx.db.insert(equipmentRecords).values(part),
  );
  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return { imported: valid.length };
}
