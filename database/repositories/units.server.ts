import { and, asc, eq, sql } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, tenants, units } from "../schema";

export type UnitListItem = {
  id: string;
  type: "room" | "parking";
  code: string;
  /** 有効な契約が無ければ空室 */
  isVacant: boolean;
  tenantName: string | null;
  /** 契約中は現在家賃、空室中は募集家賃 */
  rent: number | null;
  nextRenewalDate: IsoDate | null;
  listingStartedOn: IsoDate | null;
};

/**
 * 部屋・駐車場の一覧。
 *
 * 「空室」も「現在の家賃」もレコードとして保存していないため、ここで導出する。
 *   - 空室     … status='active' の契約が存在しない
 *   - 現在家賃 … 適用開始日が asOf 以前で確定済みの改定のうち最新のもの
 *
 * @param asOf 家賃の基準日。呼び出し側（loader）が日本時間の今日を渡す。
 *             リポジトリ内で now を参照しないことで、テスト時に日付を固定できる。
 */
export async function listUnits(
  ctx: OrgContext,
  { asOf }: { asOf: IsoDate },
): Promise<UnitListItem[]> {
  const currentRent = sql<number | null>`(
    select r.amount
    from rent_revisions r
    where r.lease_id = ${leases.id}
      and r.confirmed = 1
      and r.effective_from <= ${asOf}
    order by r.effective_from desc
    limit 1
  )`;

  const rows = await ctx.db
    .select({
      id: units.id,
      type: units.type,
      code: units.code,
      listingRent: units.listingRent,
      listingStartedOn: units.listingStartedOn,
      leaseId: leases.id,
      nextRenewalDate: leases.nextRenewalDate,
      tenantName: tenants.name,
      currentRent: currentRent,
    })
    .from(units)
    .leftJoin(leases, and(eq(leases.unitId, units.id), eq(leases.status, "active")))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(units.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), asc(units.code));

  return rows.map((row) => {
    const isVacant = row.leaseId === null;
    return {
      id: row.id,
      type: row.type,
      code: row.code,
      isVacant,
      tenantName: isVacant ? null : row.tenantName,
      rent: isVacant ? row.listingRent : row.currentRent,
      nextRenewalDate: isVacant ? null : row.nextRenewalDate,
      listingStartedOn: isVacant ? row.listingStartedOn : null,
    };
  });
}

export type UnitOption = {
  id: string;
  type: "room" | "parking";
  code: string;
};

/** 修繕案件の対象選択などに使う軽量な一覧 */
export async function listUnitOptions(ctx: OrgContext): Promise<UnitOption[]> {
  return ctx.db
    .select({ id: units.id, type: units.type, code: units.code })
    .from(units)
    .where(eq(units.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), asc(units.code));
}

export type UnitDetail = {
  id: string;
  type: "room" | "parking";
  code: string;
  isVacant: boolean;
  listingRent: number | null;
  listingStartedOn: IsoDate | null;
  lease: {
    id: string;
    tenantName: string | null;
    contractDate: IsoDate;
    nextRenewalDate: IsoDate | null;
    rent: number | null;
  } | null;
};

export async function getUnitDetail(
  ctx: OrgContext,
  unitId: string,
  { asOf }: { asOf: IsoDate },
): Promise<UnitDetail | null> {
  const currentRent = sql<number | null>`(
    select r.amount
    from rent_revisions r
    where r.lease_id = ${leases.id}
      and r.confirmed = 1
      and r.effective_from <= ${asOf}
    order by r.effective_from desc
    limit 1
  )`;

  const [row] = await ctx.db
    .select({
      id: units.id,
      type: units.type,
      code: units.code,
      listingRent: units.listingRent,
      listingStartedOn: units.listingStartedOn,
      leaseId: leases.id,
      contractDate: leases.contractDate,
      nextRenewalDate: leases.nextRenewalDate,
      tenantName: tenants.name,
      currentRent,
    })
    .from(units)
    .leftJoin(leases, and(eq(leases.unitId, units.id), eq(leases.status, "active")))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)));

  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    code: row.code,
    isVacant: row.leaseId === null,
    listingRent: row.listingRent,
    listingStartedOn: row.listingStartedOn,
    // leaseId が無い＝空室。contractDate は LEFT JOIN の都合で null 許容になっているだけ
    lease:
      row.leaseId === null || row.contractDate === null
        ? null
        : {
            id: row.leaseId,
            tenantName: row.tenantName,
            contractDate: row.contractDate,
            nextRenewalDate: row.nextRenewalDate,
            rent: row.currentRent,
          },
  };
}

/**
 * 空室の募集内容を設定する。
 *
 * 退居手続きの完了時にはここを自動で埋めない。
 * いくらで募集するかは人が決めることなので、画面から入力してもらう。
 */
export async function updateListing(
  ctx: OrgContext,
  unitId: string,
  input: { rent: number | null; startedOn: IsoDate | null },
): Promise<void> {
  await ctx.db
    .update(units)
    .set({
      listingRent: input.rent,
      listingStartedOn: input.startedOn,
      updatedAt: new Date(),
    })
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)));
}

/** 一覧上部に出すサマリ */
export function summarize(items: UnitListItem[]) {
  const rooms = items.filter((i) => i.type === "room");
  const parking = items.filter((i) => i.type === "parking");
  return {
    rooms: { total: rooms.length, vacant: rooms.filter((i) => i.isVacant).length },
    parking: { total: parking.length, vacant: parking.filter((i) => i.isVacant).length },
  };
}
