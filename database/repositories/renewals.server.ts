import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { OrgContext } from "../context.server";
import { leases, procedures, rentRevisions, tenants, units } from "../schema";

/** 未完了の更新。期限超過も残し、日付未定は末尾に置く。 */
export async function listRenewals(ctx: OrgContext) {
  const [rows, revisions] = await Promise.all([
    ctx.db.select({
      procedureId: procedures.id, leaseId: leases.id,
      renewalDate: procedures.scheduledOn, unitCode: units.code,
      tenantName: tenants.name,
    }).from(procedures)
      .innerJoin(leases, and(eq(leases.id, procedures.leaseId), eq(leases.organizationId, ctx.organizationId)))
      .innerJoin(units, and(eq(units.id, leases.unitId), eq(units.organizationId, ctx.organizationId)))
      .innerJoin(tenants, and(eq(tenants.id, leases.tenantId), eq(tenants.organizationId, ctx.organizationId)))
      .where(and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.type, "renewal"), ne(procedures.status, "done"), eq(leases.status, "active")))
      .orderBy(sql`${procedures.scheduledOn} is null`, asc(procedures.scheduledOn), asc(units.displayOrder), asc(units.code), asc(procedures.id)),
    ctx.db.select({ leaseId: rentRevisions.leaseId, date: rentRevisions.effectiveFrom, amount: rentRevisions.amount })
      .from(rentRevisions)
      .where(and(eq(rentRevisions.organizationId, ctx.organizationId), eq(rentRevisions.confirmed, true)))
      .orderBy(asc(rentRevisions.effectiveFrom), asc(rentRevisions.createdAt), asc(rentRevisions.id)),
  ]);
  const byLease = new Map<string, typeof revisions>();
  for (const revision of revisions) {
    const history = byLease.get(revision.leaseId) ?? [];
    history.push(revision);
    byLease.set(revision.leaseId, history);
  }
  return rows.map((row) => {
    let rentBefore: number | null = null;
    const increases: { year: string; amount: number; rent: number }[] = [];
    for (const revision of byLease.get(row.leaseId) ?? []) {
      // 日付未定では「その更新より前」を判定できない。
      if (!row.renewalDate || revision.date >= row.renewalDate) break;
      if (rentBefore !== null && revision.amount > rentBefore) {
        increases.push({ year: revision.date.slice(0, 4), amount: revision.amount - rentBefore, rent: revision.amount });
      }
      rentBefore = revision.amount;
    }
    return { ...row, rentBefore, increases: increases.reverse() };
  });
}
