import type { BatchItem } from "drizzle-orm/batch";
import { and, eq } from "drizzle-orm";

import { addYears, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, rentRevisions, tenants, units } from "../schema";
import { startProcedure } from "./procedures.server";

export type RegisterPastLeaseInput = {
  unitId: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  /** 家賃。分からなければ null（改定履歴を作らない） */
  rent: number | null;
  /** 退去日。分からなければ null */
  endedOn: IsoDate | null;
};

/**
 * すでに終了した（退去済みの）契約を登録する。
 *
 * 導入時に過去の入居履歴を移すための入口。現在の契約とは扱いが3つ違う。
 *
 * 1. **その部屋に現在の契約があっても登録できる。** 過去の履歴は今の入居者と共存する
 * 2. **更新手続きを作らない。** 退去した人に更新の予定は要らない
 * 3. **募集情報に触らない。** 今この部屋が空室かどうかは、現在の契約の有無で決まる
 */
export async function registerPastLease(
  ctx: OrgContext,
  input: RegisterPastLeaseInput,
): Promise<{ leaseId: string }> {
  const [unit] = await ctx.db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, input.unitId)));

  if (!unit) throw new Response("部屋が見つかりません", { status: 404 });

  const tenantId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();

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
      // 終わった契約に次回更新日は無い
      nextRenewalDate: null,
      status: "ended",
      endedOn: input.endedOn,
    }),
  ];

  // 家賃が分からない古い契約もある。その場合は改定履歴を作らない
  if (input.rent !== null) {
    writes.push(
      ctx.db.insert(rentRevisions).values({
        organizationId: ctx.organizationId,
        leaseId,
        effectiveFrom: input.contractDate,
        amount: input.rent,
        reason: "initial",
        confirmed: true,
      }),
    );
  }

  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return { leaseId };
}

export type RegisterExistingLeaseInput = {
  unitId: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  /** 家賃。分からなければ null（改定履歴を作らない） */
  rent: number | null;
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
    // 契約が入るので募集は取り下げる
    ctx.db
      .update(units)
      .set({ listingRent: null, listingStartedOn: null, updatedAt: new Date() })
      .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, input.unitId))),
  ];

  // 現在の家賃は改定履歴から導出するため、初回の改定として1件作る。
  // 家賃が分からないまま登録することもできる（あとから契約の編集で入れられる）
  if (input.rent !== null) {
    writes.push(
      ctx.db.insert(rentRevisions).values({
        organizationId: ctx.organizationId,
        leaseId,
        effectiveFrom: input.contractDate,
        amount: input.rent,
        reason: "initial",
        confirmed: true,
      }),
    );
  }

  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  await startProcedure(ctx, {
    leaseId,
    type: "renewal",
    scheduledOn: nextRenewalDate,
  });

  return { leaseId };
}
