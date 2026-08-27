import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, procedures, rentRevisions, tenants, units } from "../schema";

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
  /** 入居手続きが進行中の入居者名。決まっているが、まだ住んでいない */
  upcomingTenantName: string | null;
};

/**
 * 部屋・駐車場の一覧。
 *
 * 「空室」も「現在の家賃」もレコードとして保存していないため、ここで導出する。
 *   - 空室     … status='active' の契約が存在しない
 *                （入居手続き中の pending は、まだ住んでいないので数えない）
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
    .leftJoin(
      leases,
      and(eq(leases.unitId, units.id), eq(leases.status, "active")),
    )
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(units.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), asc(units.code));

  const upcoming = await pendingTenantsByUnit(ctx);

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
      upcomingTenantName: upcoming.get(row.id) ?? null,
    };
  });
}

/**
 * 入居手続きが進行中の契約を部屋ごとに引く。
 *
 * **上の JOIN には混ぜられない。** 退居待ちの部屋には active と pending が
 * 同居するため、条件を広げると1つの部屋が2行になって一覧に二重に並ぶ。
 */
async function pendingTenantsByUnit(
  ctx: OrgContext,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ unitId: leases.unitId, tenantName: tenants.name })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.status, "pending"),
      ),
    );

  return new Map(rows.map((r) => [r.unitId, r.tenantName]));
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

export type MoveInTarget = UnitOption & {
  /** 選択肢に添える状態。空室なのか、退居待ちなのか */
  note: string;
};

/**
 * これから入居手続きを始められる部屋。
 *
 *   - 空室
 *   - 退居手続きが進行中の部屋（終わる前に次が決まることがある）
 *
 * すでに入居手続きが動いている部屋は外す。1部屋に同時に1件までのため。
 *
 * **相関サブクエリを使わず、素直に3回引いて JS で突き合わせている。**
 * JOIN の無いクエリで `${units.id}` を埋め込むと、Drizzle が修飾なしの
 * `"id"` を出力し、SQLite がサブクエリ側の列に解決してしまう事故がある。
 * 部屋数は数十なので、読みやすさを取る。
 */
export async function listMoveInTargets(
  ctx: OrgContext,
): Promise<MoveInTarget[]> {
  const [all, live, openMoveOuts] = await Promise.all([
    listUnitOptions(ctx),
    ctx.db
      .select({
        leaseId: leases.id,
        unitId: leases.unitId,
        status: leases.status,
        tenantName: tenants.name,
      })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(
        and(
          eq(leases.organizationId, ctx.organizationId),
          inArray(leases.status, ["pending", "active"]),
        ),
      ),
    ctx.db
      .select({ leaseId: procedures.leaseId })
      .from(procedures)
      .where(
        and(
          eq(procedures.organizationId, ctx.organizationId),
          eq(procedures.type, "move_out"),
          ne(procedures.status, "done"),
        ),
      ),
  ]);

  const movingOut = new Set(openMoveOuts.map((r) => r.leaseId));
  const pending = new Set(
    live.filter((l) => l.status === "pending").map((l) => l.unitId),
  );
  const active = new Map(
    live.filter((l) => l.status === "active").map((l) => [l.unitId, l]),
  );

  return all.flatMap((unit) => {
    if (pending.has(unit.id)) return [];

    const current = active.get(unit.id);
    if (!current) return [{ ...unit, note: "空室" }];
    if (movingOut.has(current.leaseId)) {
      return [{ ...unit, note: `退居手続き中・${current.tenantName}` }];
    }
    return [];
  });
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
  /** 進行中の入居手続き。空室・入居中のどちらでも並行して存在しうる */
  upcoming: {
    leaseId: string;
    tenantName: string | null;
    tenantBirthYear: number | null;
    contractDate: IsoDate;
    /** 契約時に決めた家賃。まだ住んでいないので「現在の家賃」ではない */
    rent: number | null;
    procedureId: string | null;
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
    .leftJoin(
      leases,
      and(eq(leases.unitId, units.id), eq(leases.status, "active")),
    )
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)),
    );

  if (!row) return null;

  /*
   * 契約時の家賃。上の currentRent とは条件が違う。
   * 契約日が先の日付だと `effective_from <= asOf` を満たさず消えてしまうため、
   * 日付で絞らずに最新の確定済み改定を取る。
   */
  const contractRent = sql<number | null>`(
    select r.amount
    from rent_revisions r
    where r.lease_id = ${leases.id}
      and r.confirmed = 1
    order by r.effective_from desc
    limit 1
  )`;

  const [upcoming] = await ctx.db
    .select({
      leaseId: leases.id,
      tenantName: tenants.name,
      tenantBirthYear: tenants.birthYear,
      contractDate: leases.contractDate,
      rent: contractRent,
      procedureId: procedures.id,
    })
    .from(leases)
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .leftJoin(
      procedures,
      and(eq(procedures.leaseId, leases.id), eq(procedures.type, "move_in")),
    )
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.unitId, unitId),
        eq(leases.status, "pending"),
      ),
    )
    .limit(1);

  return {
    id: row.id,
    type: row.type,
    code: row.code,
    isVacant: row.leaseId === null,
    listingRent: row.listingRent,
    listingStartedOn: row.listingStartedOn,
    upcoming: upcoming ?? null,
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
  status: "pending" | "active" | "ended";
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
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.unitId, unitId),
      ),
    )
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
      and(
        eq(rentRevisions.organizationId, ctx.organizationId),
        eq(leases.unitId, unitId),
      ),
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
    .where(
      and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)),
    );
}

/** 一覧上部に出すサマリ */
export function summarize(items: UnitListItem[]) {
  const rooms = items.filter((i) => i.type === "room");
  const parking = items.filter((i) => i.type === "parking");
  return {
    rooms: {
      total: rooms.length,
      vacant: rooms.filter((i) => i.isVacant).length,
    },
    parking: {
      total: parking.length,
      vacant: parking.filter((i) => i.isVacant).length,
    },
  };
}
