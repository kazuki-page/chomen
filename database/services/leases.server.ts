import type { BatchItem } from "drizzle-orm/batch";
import { and, eq } from "drizzle-orm";

import { addYears, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, rentRevisions, tenants, units } from "../schema";
import { startProcedure } from "./procedures.server";

export type RegisterExistingLeaseInput = {
  unitId: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  rent: number;
  /** 省略時は契約日の2年後 */
  nextRenewalDate: IsoDate | null;
};

/**
 * すでに入居している部屋の契約を登録する。
 *
 * 新規入居は「入居手続き」から始まるが、導入時点で入居中の部屋は
 * 手続きを最初から踏めない。そのための移行専用の入口。
 *
 * 登録と同時に**次回の更新手続きを自動生成する**ので、
 * 導入直後から更新期限がホーム画面に並ぶ。
 */
export async function registerExistingLease(
  ctx: OrgContext,
  input: RegisterExistingLeaseInput,
): Promise<{ leaseId: string }> {
  const [unit] = await ctx.db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, input.unitId)));

  if (!unit) throw new Response("部屋が見つかりません", { status: 404 });

  const active = await ctx.db
    .select({ id: leases.id })
    .from(leases)
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.unitId, input.unitId),
        eq(leases.status, "active"),
      ),
    )
    .limit(1);

  if (active.length > 0) {
    throw new Response("この部屋にはすでに契約があります", { status: 400 });
  }

  const tenantId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const nextRenewalDate = input.nextRenewalDate ?? addYears(input.contractDate, 2);

  const writes: BatchItem<"sqlite">[] = [
    ctx.db.insert(tenants).values({
      id: tenantId,
      organizationId: ctx.organizationId,
      name: input.tenantName,
      birthYear: input.birthYear,
    }),
    ctx.db.insert(leases).values({
      id: leaseId,
      organizationId: ctx.organizationId,
      unitId: input.unitId,
      tenantId,
      contractDate: input.contractDate,
      nextRenewalDate,
      status: "active",
    }),
    // 現在の家賃は改定履歴から導出するため、初回の改定として1件作る
    ctx.db.insert(rentRevisions).values({
      organizationId: ctx.organizationId,
      leaseId,
      effectiveFrom: input.contractDate,
      amount: input.rent,
      reason: "initial",
      confirmed: true,
    }),
    // 契約が入るので募集は取り下げる
    ctx.db
      .update(units)
      .set({ listingRent: null, listingStartedOn: null, updatedAt: new Date() })
      .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, input.unitId))),
  ];

  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  await startProcedure(ctx, {
    leaseId,
    type: "renewal",
    scheduledOn: nextRenewalDate,
  });

  return { leaseId };
}
