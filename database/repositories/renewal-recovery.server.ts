import { and, eq, sql } from "drizzle-orm";
import type { OrgContext } from "../context.server";
import { leases, organizations } from "../schema";

function missingRenewal(ctx: OrgContext) {
  return and(
    eq(leases.organizationId, ctx.organizationId),
    eq(leases.status, "active"),
    sql`${leases.nextRenewalDate} is not null`,
    sql`not exists (select 1 from procedures p
      where p.organization_id = ${ctx.organizationId} and p.lease_id = ${leases.id}
      and p.type in ('renewal', 'move_out') and p.status != 'done')`,
  );
}

/** 日付だけが残り、更新手続きが欠落した入居中の契約。退居中は対象外。 */
export async function getRenewalRecoveryCandidate(ctx: OrgContext, unitId: string) {
  const [row] = await ctx.db.select({ leaseId: leases.id, scheduledOn: leases.nextRenewalDate })
    .from(leases).where(and(missingRenewal(ctx), eq(leases.unitId, unitId))).limit(1);
  return row?.scheduledOn ? { leaseId: row.leaseId, scheduledOn: row.scheduledOn } : null;
}

/** 作成バッチ内で再検証し、並行操作による二重作成を防ぐ。 */
export function guardRenewalRecovery(
  ctx: OrgContext,
  candidate: { leaseId: string; scheduledOn: string },
) {
  return ctx.db.select({ valid: sql<number>`case when exists (
    select 1 from leases where ${missingRenewal(ctx)}
    and ${leases.id} = ${candidate.leaseId}
    and ${leases.nextRenewalDate} = ${candidate.scheduledOn}
  ) then 1 else json('契約が変更されました。再読み込みしてください。') end` })
    .from(organizations).where(eq(organizations.id, ctx.organizationId));
}
