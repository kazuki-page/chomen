import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { OrgContext } from "../context.server";
import { leases, organizations, procedures, rentRevisions, tenants } from "../schema";
import { units } from "../schema";

/** 同名・同じ部屋の直前契約を候補にするだけで、本人確認は画面で行う。 */
export async function listRenewalRepairCandidates(ctx: OrgContext) {
  const rows = await ctx.db.select({
    id: leases.id, unitId: leases.unitId, unitCode: units.code,
    status: leases.status, contractDate: leases.contractDate,
    tenantName: tenants.name, birthYear: tenants.birthYear,
    procedureCount: sql<number>`(select count(*) from procedures p where p.organization_id = ${ctx.organizationId} and p.lease_id = ${leases.id})`,
    rent: sql<number | null>`(select r.amount from rent_revisions r where r.organization_id = ${ctx.organizationId} and r.lease_id = ${leases.id} and r.confirmed = 1 order by r.effective_from desc limit 1)`,
  }).from(leases)
    .innerJoin(units, and(eq(units.id, leases.unitId), eq(units.organizationId, ctx.organizationId)))
    .innerJoin(tenants, and(eq(tenants.id, leases.tenantId), eq(tenants.organizationId, ctx.organizationId)))
    .where(eq(leases.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), asc(units.code), asc(units.id), asc(leases.contractDate), asc(leases.id));
  return rows.flatMap((target, index) => {
    const source = rows[index - 1];
    if (target.status !== "active" || !source || source.unitId !== target.unitId || source.status !== "ended"
      || source.tenantName !== target.tenantName || source.contractDate >= target.contractDate
      || (source.birthYear !== null && target.birthYear !== null && source.birthYear !== target.birthYear)) return [];
    return [{ unitId: target.unitId, unitCode: target.unitCode, source, target }];
  });
}

/**
 * 取り込み時に別契約になった更新を、本人が確認したうえで現在の契約へまとめる。
 * 同名だけで自動実行しない。手続きのない直前の終了契約に限定する。
 */
export async function repairRenewalHistory(
  ctx: OrgContext,
  input: { unitId: string; sourceLeaseId: string; targetLeaseId: string; now: Date },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fail = (error: string) => ({ ok: false as const, error });
  const rows = await ctx.db.select({
    id: leases.id, tenantId: leases.tenantId, status: leases.status,
    contractDate: leases.contractDate, name: tenants.name, birthYear: tenants.birthYear,
    updatedAt: leases.updatedAt, tenantUpdatedAt: tenants.updatedAt,
  }).from(leases)
    .innerJoin(tenants, and(eq(tenants.id, leases.tenantId), eq(tenants.organizationId, ctx.organizationId)))
    .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.unitId, input.unitId)))
    .orderBy(asc(leases.contractDate), asc(leases.id));
  const targetIndex = rows.findIndex((r) => r.id === input.targetLeaseId && r.status === "active");
  const target = rows[targetIndex];
  const source = rows[targetIndex - 1];
  if (!target || !source || source.id !== input.sourceLeaseId || source.status !== "ended") {
    return fail("現在の契約と、その直前の終了した契約を選んでください。");
  }
  if (source.name !== target.name || (source.birthYear !== null && target.birthYear !== null && source.birthYear !== target.birthYear)) {
    return fail("氏名または生年が一致しないため、まとめられません。");
  }
  if (source.contractDate >= target.contractDate) return fail("契約日の順序を確認してください。");

  const [sourceProcedures, revisions] = await Promise.all([
    ctx.db.select({ id: procedures.id }).from(procedures)
      .where(and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.leaseId, source.id))),
    ctx.db.select().from(rentRevisions)
      .where(and(eq(rentRevisions.organizationId, ctx.organizationId), inArray(rentRevisions.leaseId, [source.id, target.id])))
      .orderBy(asc(rentRevisions.effectiveFrom)),
  ]);
  if (sourceProcedures.length) return fail("過去の契約に手続きの記録があります。自動ではまとめられません。");
  const sourceRevisions = revisions.filter((r) => r.leaseId === source.id);
  // 家賃不明の過去契約は改定レコードを持たない。空のまま統合し、金額を推測しない。
  if (sourceRevisions.some((r) => !r.confirmed || r.effectiveFrom < source.contractDate || r.effectiveFrom >= target.contractDate)) {
    return fail("過去の契約の家賃が未確定、または契約日の範囲外です。");
  }
  if (revisions.some((r) => r.leaseId === target.id && r.effectiveFrom < target.contractDate)) {
    return fail("現在の契約に契約日前の家賃があります。履歴を確認してください。");
  }

  // 家賃の金額・日付・確定状態と、現在の手続き・次回更新日は保持する。
  // 各更新は件数に関係なく少数の変数で実行し、D1の100変数制限を超えない。
  try {
    await ctx.db.batch([
    // 読み取り後に編集が入った場合はバッチ全体を失敗させる。
    // 特に直前に作られた手続きを契約削除のcascadeで失わないための再検証。
    ctx.db.select({ valid: sql<number>`case when
      (select count(*) from leases l where l.organization_id = ${ctx.organizationId}
        and ((l.id = ${source.id} and l.status = 'ended' and l.contract_date = ${source.contractDate} and l.updated_at = ${source.updatedAt.getTime()})
          or (l.id = ${target.id} and l.status = 'active' and l.contract_date = ${target.contractDate} and l.updated_at = ${target.updatedAt.getTime()}))) = 2
      and (select count(*) from leases l where l.organization_id = ${ctx.organizationId}
        and l.unit_id = ${input.unitId}) = ${rows.length}
      and (select count(*) from tenants t where t.organization_id = ${ctx.organizationId}
        and ((t.id = ${source.tenantId} and t.updated_at = ${source.tenantUpdatedAt.getTime()})
          or (t.id = ${target.tenantId} and t.updated_at = ${target.tenantUpdatedAt.getTime()}))) = ${source.tenantId === target.tenantId ? 1 : 2}
      and not exists (select 1 from procedures p where p.organization_id = ${ctx.organizationId} and p.lease_id = ${source.id})
      and (select count(*) from rent_revisions r where r.organization_id = ${ctx.organizationId}
        and r.lease_id in (${source.id}, ${target.id})) = ${revisions.length}
      and not exists (select 1 from rent_revisions r where r.organization_id = ${ctx.organizationId}
        and ((r.lease_id = ${source.id} and (r.confirmed != 1 or r.effective_from < ${source.contractDate} or r.effective_from >= ${target.contractDate}))
          or (r.lease_id = ${target.id} and r.effective_from < ${target.contractDate})))
      then 1 else json('履歴が変更されました。再読み込みしてください。') end` })
      .from(organizations).where(eq(organizations.id, ctx.organizationId)),
    ctx.db.update(rentRevisions).set({ leaseId: target.id, updatedAt: input.now })
      .where(and(eq(rentRevisions.organizationId, ctx.organizationId), eq(rentRevisions.leaseId, source.id))),
    ctx.db.update(rentRevisions).set({ reason: "renewal", updatedAt: input.now })
      .where(and(eq(rentRevisions.organizationId, ctx.organizationId), eq(rentRevisions.leaseId, target.id), eq(rentRevisions.reason, "initial"), eq(rentRevisions.effectiveFrom, target.contractDate))),
    ctx.db.update(leases).set({ contractDate: source.contractDate, updatedAt: input.now })
      .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, target.id))),
    ctx.db.delete(leases).where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, source.id))),
    ]);
  } catch {
    return fail("修正できませんでした。履歴が変更された可能性があります。再読み込みして確認してください。");
  }
  // 元の入居者レコードは削除しない。他契約から参照される可能性がある。
  return { ok: true };
}
