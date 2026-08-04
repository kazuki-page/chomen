import { and, eq } from "drizzle-orm";

import { ENDED_STATUS_WORDS, MAX_IMPORT_ROWS } from "~/lib/constants";
import { looksLikeHeader, normalizeDate, normalizeNumber, parseTable } from "~/lib/tabular";
import { addYears, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, units } from "../schema";
import { registerExistingLease, registerPastLease } from "./leases.server";

const HEADER_KEYWORDS = ["部屋", "号室", "氏名", "名前", "契約", "家賃"];

export type ImportRow = {
  lineNumber: number;
  raw: string[];
  unitCode: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate | null;
  rent: number | null;
  nextRenewalDate: IsoDate | null;
  /** 終了した（退去済みの）契約か */
  isPast: boolean;
  endedOn: IsoDate | null;
  unitId: string | null;
  /** 空なら取り込める */
  errors: string[];
};

export type ImportPreview = {
  rows: ImportRow[];
  okCount: number;
  errorCount: number;
  /** そのうち過去の契約として取り込む件数 */
  pastCount: number;
};

/** 状態欄と退去日から、終了した契約かどうかを判定する */
function looksEnded(statusRaw: string, endedRaw: string): boolean {
  const status = statusRaw.trim();
  if (ENDED_STATUS_WORDS.some((word) => status.includes(word))) return true;
  // 状態が空でも退去日が入っていれば終了とみなす
  return endedRaw.trim() !== "";
}

/**
 * 貼り付けられた表を検証する。**この時点では一切書き込まない。**
 *
 * 一括投入は取り返しがつきにくいので、必ずプレビューを挟んで
 * 「何が作られるか」「どの行が駄目か」を見せてから確定させる。
 *
 * 契約中と終了済みでは検証の仕方が違う。
 *   - 契約中 … 1部屋に1つだけ。すでに契約中の部屋には入れられない
 *   - 終了済み … 過去の履歴なので、現在の入居者がいる部屋にも積める
 */
export async function previewLeaseImport(
  ctx: OrgContext,
  text: string,
): Promise<ImportPreview> {
  const table = parseTable(text);
  if (table.length === 0) return { rows: [], okCount: 0, errorCount: 0, pastCount: 0 };

  const body = looksLikeHeader(table[0], HEADER_KEYWORDS) ? table.slice(1) : table;

  const unitRows = await ctx.db
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(eq(units.organizationId, ctx.organizationId));
  const unitByCode = new Map(unitRows.map((u) => [u.code, u.id]));

  // 契約中の部屋と、既存の契約（部屋＋契約日）の両方を引く
  const existingLeases = await ctx.db
    .select({
      unitId: leases.unitId,
      contractDate: leases.contractDate,
      status: leases.status,
    })
    .from(leases)
    .where(eq(leases.organizationId, ctx.organizationId));

  const occupied = new Set(
    existingLeases.filter((l) => l.status === "active").map((l) => l.unitId),
  );
  const existingKeys = new Set(existingLeases.map((l) => `${l.unitId}:${l.contractDate}`));

  const seenActiveUnits = new Set<string>();
  const seenKeys = new Set<string>();
  const rows: ImportRow[] = [];

  for (const [index, cells] of body.slice(0, MAX_IMPORT_ROWS).entries()) {
    const [
      unitCode = "",
      tenantName = "",
      birthYearRaw = "",
      contractRaw = "",
      rentRaw = "",
      renewalRaw = "",
      statusRaw = "",
      endedRaw = "",
    ] = cells;

    const errors: string[] = [];
    const unitId = unitByCode.get(unitCode.trim()) ?? null;
    const isPast = looksEnded(statusRaw, endedRaw);

    if (!unitCode) errors.push("部屋番号がありません");
    else if (!unitId) errors.push(`部屋「${unitCode}」が登録されていません`);

    if (!tenantName) errors.push("氏名がありません");

    const contractDate = normalizeDate(contractRaw);
    if (!contractRaw) errors.push("契約日がありません");
    else if (!contractDate) errors.push(`契約日「${contractRaw}」を読み取れません`);

    const rent = normalizeNumber(rentRaw);
    if (!rentRaw) errors.push("家賃がありません");
    else if (rent === null) errors.push(`家賃「${rentRaw}」を読み取れません`);

    const endedOn = endedRaw.trim() ? normalizeDate(endedRaw) : null;
    if (endedRaw.trim() && !endedOn) {
      errors.push(`退去日「${endedRaw}」を読み取れません`);
    }
    if (contractDate && endedOn && endedOn < contractDate) {
      errors.push("退去日が契約日より前です");
    }

    const nextRenewalDate = renewalRaw ? normalizeDate(renewalRaw) : null;
    if (renewalRaw && !nextRenewalDate) {
      errors.push(`次回更新日「${renewalRaw}」を読み取れません`);
    }

    // 同じ部屋・同じ契約日は同一の契約とみなす
    if (unitId && contractDate) {
      const key = `${unitId}:${contractDate}`;
      if (existingKeys.has(key)) errors.push("同じ契約がすでにあります");
      else if (seenKeys.has(key)) errors.push("同じ契約が複数行にあります");
      seenKeys.add(key);
    }

    // 契約中は1部屋に1つだけ。過去の契約はこの制約を受けない
    if (unitId && !isPast) {
      if (occupied.has(unitId)) errors.push("すでに契約があります");
      else if (seenActiveUnits.has(unitId)) errors.push("同じ部屋の契約が複数行にあります");
      seenActiveUnits.add(unitId);
    }

    rows.push({
      lineNumber: index + 1,
      raw: cells,
      unitCode,
      tenantName,
      birthYear: birthYearRaw ? normalizeNumber(birthYearRaw) : null,
      contractDate,
      rent,
      // 終了した契約に次回更新日は持たせない
      nextRenewalDate: isPast
        ? null
        : (nextRenewalDate ?? (contractDate ? addYears(contractDate, 2) : null)),
      isPast,
      endedOn,
      unitId,
      errors,
    });
  }

  const ok = rows.filter((r) => r.errors.length === 0);
  return {
    rows,
    okCount: ok.length,
    errorCount: rows.length - ok.length,
    pastCount: ok.filter((r) => r.isPast).length,
  };
}

/**
 * 検証を通った行だけを取り込む。
 *
 * 契約中は既存の登録処理を通すので、次回の更新手続きの自動生成まで
 * 手入力と同じ結果になる。終了した契約は履歴として積むだけで手続きは作らない。
 */
export async function commitLeaseImport(
  ctx: OrgContext,
  text: string,
): Promise<{ imported: number; past: number; failed: { unitCode: string; reason: string }[] }> {
  const preview = await previewLeaseImport(ctx, text);
  const failed: { unitCode: string; reason: string }[] = [];
  let imported = 0;
  let past = 0;

  for (const row of preview.rows) {
    if (row.errors.length > 0 || !row.unitId || !row.contractDate || row.rent === null) continue;

    try {
      if (row.isPast) {
        await registerPastLease(ctx, {
          unitId: row.unitId,
          tenantName: row.tenantName,
          birthYear: row.birthYear,
          contractDate: row.contractDate,
          rent: row.rent,
          endedOn: row.endedOn,
        });
        past++;
      } else {
        await registerExistingLease(ctx, {
          unitId: row.unitId,
          tenantName: row.tenantName,
          birthYear: row.birthYear,
          contractDate: row.contractDate,
          rent: row.rent,
          nextRenewalDate: row.nextRenewalDate,
        });
      }
      imported++;
    } catch {
      failed.push({ unitCode: row.unitCode, reason: "登録に失敗しました" });
    }
  }

  return { imported, past, failed };
}
