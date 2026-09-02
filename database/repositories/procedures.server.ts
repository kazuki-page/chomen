import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { labelForType, type ProcedureType } from "../procedure-templates";
import { leases, procedureItems, procedures, tenants, units } from "../schema";

export type ProcedureSummary = {
  id: string;
  type: ProcedureType;
  typeLabel: string;
  scheduledOn: IsoDate | null;
  unitCode: string;
  tenantName: string | null;
  /** 次にやること。null なら全項目完了 */
  nextItemLabel: string | null;
  doneCount: number;
  totalCount: number;
};

export type ProcedureDetail = ProcedureSummary & {
  status: "todo" | "in_progress" | "done";
  items: {
    id: string;
    key: string;
    label: string;
    checked: boolean;
    valueText: string | null;
  }[];
};

/** 手続き開始前に、契約が現在の組織へ属することを確認する。 */
export async function leaseExists(
  ctx: OrgContext,
  leaseId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: leases.id })
    .from(leases)
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.id, leaseId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * 未完了の手続き。ホーム画面の「やること」に使う。
 *
 * 更新手続きは契約時に2年先ぶんが自動生成されるため、そのまま並べると
 * 全部屋ぶんが常時表示されて画面が使い物にならない。
 * **予定日が `renewalUntil` 以内のものだけ**を出す（入居・退居は常に出す）。
 * 着手済み（in_progress）の更新は、先の予定でも隠さない。
 */
export async function listOpenProcedures(
  ctx: OrgContext,
  { renewalUntil }: { renewalUntil: IsoDate },
): Promise<ProcedureSummary[]> {
  const rows = await ctx.db
    .select({
      id: procedures.id,
      type: procedures.type,
      scheduledOn: procedures.scheduledOn,
      unitCode: units.code,
      tenantName: tenants.name,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(
        eq(procedures.organizationId, ctx.organizationId),
        ne(procedures.status, "done"),
        or(
          // 入居・退居は期限に関係なく進行中の作業なので常に出す
          ne(procedures.type, "renewal"),
          eq(procedures.status, "in_progress"),
          lte(procedures.scheduledOn, renewalUntil),
          // 予定日が未設定のものを取りこぼさない
          isNull(procedures.scheduledOn),
        ),
      ),
    )
    .orderBy(asc(procedures.scheduledOn));

  if (rows.length === 0) return [];

  const progress = await loadProgress(
    ctx,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    typeLabel: labelForType(r.type),
    scheduledOn: r.scheduledOn,
    unitCode: r.unitCode,
    tenantName: r.tenantName,
    ...(progress.get(r.id) ?? { nextItemLabel: null, doneCount: 0, totalCount: 0 }),
  }));
}

/**
 * 「やること」からは隠している、先の更新予定。
 * 非表示にするだけで辿れなくなると困るので、ホームから折りたたみで見られるようにする。
 */
export async function listLaterRenewals(
  ctx: OrgContext,
  { after }: { after: IsoDate },
): Promise<{ id: string; scheduledOn: IsoDate | null; unitCode: string; tenantName: string | null }[]> {
  return ctx.db
    .select({
      id: procedures.id,
      scheduledOn: procedures.scheduledOn,
      unitCode: units.code,
      tenantName: tenants.name,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(
        eq(procedures.organizationId, ctx.organizationId),
        eq(procedures.type, "renewal"),
        eq(procedures.status, "todo"),
        gt(procedures.scheduledOn, after),
      ),
    )
    .orderBy(asc(procedures.scheduledOn));
}

/** 当月に予定のある手続き */
export async function listProceduresInMonth(
  ctx: OrgContext,
  range: { from: IsoDate; to: IsoDate },
): Promise<Pick<ProcedureSummary, "id" | "type" | "typeLabel" | "scheduledOn" | "unitCode">[]> {
  const rows = await ctx.db
    .select({
      id: procedures.id,
      type: procedures.type,
      scheduledOn: procedures.scheduledOn,
      unitCode: units.code,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .where(
      and(
        eq(procedures.organizationId, ctx.organizationId),
        gte(procedures.scheduledOn, range.from),
        lte(procedures.scheduledOn, range.to),
      ),
    )
    .orderBy(asc(procedures.scheduledOn));

  return rows.map((r) => ({ ...r, typeLabel: labelForType(r.type) }));
}

/** 特定の部屋の手続き履歴（完了済みを含む） */
export async function listProceduresForUnit(
  ctx: OrgContext,
  unitId: string,
): Promise<(Pick<ProcedureSummary, "id" | "type" | "typeLabel" | "scheduledOn"> & {
  status: "todo" | "in_progress" | "done";
})[]> {
  const rows = await ctx.db
    .select({
      id: procedures.id,
      type: procedures.type,
      status: procedures.status,
      scheduledOn: procedures.scheduledOn,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .where(and(eq(procedures.organizationId, ctx.organizationId), eq(leases.unitId, unitId)))
    .orderBy(desc(procedures.scheduledOn));

  return rows.map((r) => ({ ...r, typeLabel: labelForType(r.type) }));
}

export async function getProcedure(
  ctx: OrgContext,
  procedureId: string,
): Promise<ProcedureDetail | null> {
  const [row] = await ctx.db
    .select({
      id: procedures.id,
      type: procedures.type,
      status: procedures.status,
      scheduledOn: procedures.scheduledOn,
      unitCode: units.code,
      tenantName: tenants.name,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .leftJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.id, procedureId)),
    );

  if (!row) return null;

  const items = await ctx.db
    .select({
      id: procedureItems.id,
      key: procedureItems.key,
      label: procedureItems.label,
      checkedAt: procedureItems.checkedAt,
      valueText: procedureItems.valueText,
    })
    .from(procedureItems)
    .where(
      and(
        eq(procedureItems.organizationId, ctx.organizationId),
        eq(procedureItems.procedureId, procedureId),
      ),
    )
    .orderBy(asc(procedureItems.sortOrder));

  const mapped = items.map((i) => ({
    id: i.id,
    key: i.key,
    label: i.label,
    checked: i.checkedAt !== null,
    valueText: i.valueText,
  }));

  return {
    id: row.id,
    type: row.type,
    typeLabel: labelForType(row.type),
    status: row.status,
    scheduledOn: row.scheduledOn,
    unitCode: row.unitCode,
    tenantName: row.tenantName,
    nextItemLabel: mapped.find((i) => !i.checked)?.label ?? null,
    doneCount: mapped.filter((i) => i.checked).length,
    totalCount: mapped.length,
    items: mapped,
  };
}

/**
 * 複数の手続きについて「次にやること」と進捗を求める。
 * 手続きごとにクエリを投げず、まとめて取得して JS 側で集計する。
 */
async function loadProgress(ctx: OrgContext, procedureIds: string[]) {
  const rows = await ctx.db
    .select({
      procedureId: procedureItems.procedureId,
      label: procedureItems.label,
      sortOrder: procedureItems.sortOrder,
      checkedAt: procedureItems.checkedAt,
    })
    .from(procedureItems)
    .where(
      and(
        eq(procedureItems.organizationId, ctx.organizationId),
        inArray(procedureItems.procedureId, procedureIds),
      ),
    )
    .orderBy(asc(procedureItems.sortOrder));

  const map = new Map<string, { nextItemLabel: string | null; doneCount: number; totalCount: number }>();
  for (const row of rows) {
    const entry = map.get(row.procedureId) ?? {
      nextItemLabel: null,
      doneCount: 0,
      totalCount: 0,
    };
    entry.totalCount += 1;
    if (row.checkedAt !== null) {
      entry.doneCount += 1;
    } else if (entry.nextItemLabel === null) {
      entry.nextItemLabel = row.label;
    }
    map.set(row.procedureId, entry);
  }
  return map;
}
