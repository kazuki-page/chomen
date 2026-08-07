import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, rentRevisions, tenants, units } from "../schema";

export type UnitListItem = {
  id: string;
  type: "room" | "parking";
  code: string;
  /** 有効な契約が無ければ空室 */
  isVacant: boolean;
  tenantName: string | null;
  /** 生年。年齢の算出は表示側で行う（基準日を呼び出し側が決められるように） */
  tenantBirthYear: number | null;
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
      tenantBirthYear: tenants.birthYear,
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
      tenantBirthYear: isVacant ? null : row.tenantBirthYear,
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
    tenantBirthYear: number | null;
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
      tenantBirthYear: tenants.birthYear,
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
            tenantBirthYear: row.tenantBirthYear,
            contractDate: row.contractDate,
            nextRenewalDate: row.nextRenewalDate,
            rent: row.currentRent,
          },
  };
}

export type UnitLeaseRow = {
  id: string;
  tenantName: string;
  tenantBirthYear: number | null;
  contractDate: IsoDate;
  endedOn: IsoDate | null;
  status: "active" | "ended";
  rent: number | null;
  /** ぶら下がっている手続きの件数。削除時に何が消えるかを見せるために使う */
  procedureCount: number;
};

/**
 * その部屋の入居の履歴。**現在の契約も含めて**新しい順に返す。
 *
 * 家賃の履歴（listRentHistoryForUnit）では代用できない。
 * 家賃の分からない契約は改定レコードを持たないので、そちらには現れない。
 * 誤って登録した契約を消すには、どの契約も一覧に出ている必要がある。
 */
export async function listLeasesForUnit(
  ctx: OrgContext,
  unitId: string,
): Promise<UnitLeaseRow[]> {
  const latestRent = sql<number | null>`(
    select r.amount from rent_revisions r
    where r.lease_id = ${leases.id} and r.confirmed = 1
    order by r.effective_from desc limit 1
  )`;

  const procedureCount = sql<number>`(
    select count(*) from procedures p where p.lease_id = ${leases.id}
  )`;

  return ctx.db
    .select({
      id: leases.id,
      tenantName: tenants.name,
      tenantBirthYear: tenants.birthYear,
      contractDate: leases.contractDate,
      endedOn: leases.endedOn,
      status: leases.status,
      rent: latestRent,
      procedureCount,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.unitId, unitId)))
    .orderBy(desc(leases.contractDate));
}

export type RentHistoryRow = {
  id: string;
  effectiveFrom: IsoDate;
  amount: number;
  reason: "initial" | "renewal" | "adjustment";
  confirmed: boolean;
  tenantName: string | null;
};

/**
 * その部屋の家賃の変遷。**契約単位ではなく部屋単位**で返す。
 *
 * 募集家賃を決めるのは部屋が空いたときだが、契約単位だと空室の部屋には
 * 有効な契約が無いため何も出せない。一番見たい場面で見えなくなる。
 * 歴代の入居者を通した推移が見えれば、次の募集価格を決める材料になる。
 */
export async function listRentHistoryForUnit(
  ctx: OrgContext,
  unitId: string,
): Promise<RentHistoryRow[]> {
  return ctx.db
    .select({
      id: rentRevisions.id,
      effectiveFrom: rentRevisions.effectiveFrom,
      amount: rentRevisions.amount,
      reason: rentRevisions.reason,
      confirmed: rentRevisions.confirmed,
      tenantName: tenants.name,
    })
    .from(rentRevisions)
    .innerJoin(leases, eq(leases.id, rentRevisions.leaseId))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(eq(rentRevisions.organizationId, ctx.organizationId), eq(leases.unitId, unitId)),
    )
    .orderBy(desc(rentRevisions.effectiveFrom));
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
