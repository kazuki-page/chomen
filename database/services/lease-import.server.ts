import { and, eq } from "drizzle-orm";

import { looksLikeHeader, normalizeDate, normalizeNumber, parseTable } from "~/lib/tabular";
import { addYears, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, units } from "../schema";
import { registerExistingLease } from "./leases.server";

/** 列の順番。見出し行があれば読み飛ばすが、並び順は固定 */
export const IMPORT_COLUMNS = [
  "部屋番号",
  "氏名",
  "生年",
  "契約日",
  "家賃",
  "次回更新日（省略可）",
] as const;

const HEADER_KEYWORDS = ["部屋", "号室", "氏名", "名前", "契約", "家賃"];

/** 一度に取り込める上限 */
export const MAX_IMPORT_ROWS = 200;

export type ImportRow = {
  lineNumber: number;
  raw: string[];
  unitCode: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate | null;
  rent: number | null;
  nextRenewalDate: IsoDate | null;
  unitId: string | null;
  /** 空なら取り込める */
  errors: string[];
};

export type ImportPreview = {
  rows: ImportRow[];
  okCount: number;
  errorCount: number;
};

/**
 * 貼り付けられた表を検証する。**この時点では一切書き込まない。**
 *
 * 一括投入は取り返しがつきにくいので、必ずプレビューを挟んで
 * 「何が作られるか」「どの行が駄目か」を見せてから確定させる。
 */
export async function previewLeaseImport(
  ctx: OrgContext,
  text: string,
): Promise<ImportPreview> {
  const table = parseTable(text);
  if (table.length === 0) return { rows: [], okCount: 0, errorCount: 0 };

  const body = looksLikeHeader(table[0], HEADER_KEYWORDS) ? table.slice(1) : table;

  // 部屋番号 → id、および契約済みの部屋を引く
  const unitRows = await ctx.db
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(eq(units.organizationId, ctx.organizationId));
  const unitByCode = new Map(unitRows.map((u) => [u.code, u.id]));

  const occupied = new Set(
    (
      await ctx.db
        .select({ unitId: leases.unitId })
        .from(leases)
        .where(
          and(eq(leases.organizationId, ctx.organizationId), eq(leases.status, "active")),
        )
    ).map((l) => l.unitId),
  );

  const seenCodes = new Set<string>();
  const rows: ImportRow[] = [];

  for (const [index, cells] of body.slice(0, MAX_IMPORT_ROWS).entries()) {
    const [unitCode = "", tenantName = "", birthYearRaw = "", contractRaw = "", rentRaw = "", renewalRaw = ""] =
      cells;

    const errors: string[] = [];
    const unitId = unitByCode.get(unitCode) ?? null;

    if (!unitCode) errors.push("部屋番号がありません");
    else if (!unitId) errors.push(`部屋「${unitCode}」が登録されていません`);
    else if (occupied.has(unitId)) errors.push("すでに契約があります");
    else if (seenCodes.has(unitCode)) errors.push("同じ部屋が複数行にあります");

    if (unitCode) seenCodes.add(unitCode);
    if (!tenantName) errors.push("氏名がありません");

    const contractDate = normalizeDate(contractRaw);
    if (!contractRaw) errors.push("契約日がありません");
    else if (!contractDate) errors.push(`契約日「${contractRaw}」を読み取れません`);

    const rent = normalizeNumber(rentRaw);
    if (!rentRaw) errors.push("家賃がありません");
    else if (rent === null) errors.push(`家賃「${rentRaw}」を読み取れません`);

    const nextRenewalDate = renewalRaw ? normalizeDate(renewalRaw) : null;
    if (renewalRaw && !nextRenewalDate) {
      errors.push(`次回更新日「${renewalRaw}」を読み取れません`);
    }

    const birthYear = birthYearRaw ? normalizeNumber(birthYearRaw) : null;

    rows.push({
      lineNumber: index + 1,
      raw: cells,
      unitCode,
      tenantName,
      birthYear,
      contractDate,
      rent,
      nextRenewalDate: nextRenewalDate ?? (contractDate ? addYears(contractDate, 2) : null),
      unitId,
      errors,
    });
  }

  return {
    rows,
    okCount: rows.filter((r) => r.errors.length === 0).length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
  };
}

/**
 * 検証を通った行だけを取り込む。
 *
 * 1件ずつ既存の登録処理（registerExistingLease）を通すので、
 * 次回の更新手続きの自動生成まで手入力と同じ結果になる。
 */
export async function commitLeaseImport(
  ctx: OrgContext,
  text: string,
): Promise<{ imported: number; failed: { unitCode: string; reason: string }[] }> {
  const preview = await previewLeaseImport(ctx, text);
  const failed: { unitCode: string; reason: string }[] = [];
  let imported = 0;

  for (const row of preview.rows) {
    if (row.errors.length > 0 || !row.unitId || !row.contractDate || row.rent === null) continue;

    try {
      await registerExistingLease(ctx, {
        unitId: row.unitId,
        tenantName: row.tenantName,
        birthYear: row.birthYear,
        contractDate: row.contractDate,
        rent: row.rent,
        nextRenewalDate: row.nextRenewalDate,
      });
      imported++;
    } catch {
      failed.push({ unitCode: row.unitCode, reason: "登録に失敗しました" });
    }
  }

  return { imported, failed };
}
