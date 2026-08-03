import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, ne } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { leases, procedures, rentRevisions, tenants } from "../schema";

export type LeaseEditInput = {
  leaseId: string;
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  nextRenewalDate: IsoDate | null;
  /** 現在の家賃。**打ち間違いの訂正用** */
  rent: number | null;
};

/**
 * 契約中の内容を訂正する。
 *
 * これは「間違えて入力した値を直す」ための機能であり、**契約内容の変更ではない**。
 * 家賃の改定は更新手続きから登録され、履歴として積まれる。
 * ここで家賃を書き換えるのは最新の改定レコードの訂正であって、新しい改定は作らない。
 *
 * 次回更新予定日を直した場合は、未完了の更新手続きの予定日も合わせて動かす。
 * 両者がずれると、ホーム画面に出るタイミングと部屋詳細の表示が食い違ってしまう。
 */
export async function updateLeaseDetails(
  ctx: OrgContext,
  input: LeaseEditInput,
): Promise<void> {
  const [lease] = await ctx.db
    .select({
      id: leases.id,
      tenantId: leases.tenantId,
      contractDate: leases.contractDate,
    })
    .from(leases)
    .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, input.leaseId)));

  if (!lease) throw new Response("契約が見つかりません", { status: 404 });

  const now = new Date();
  const writes: BatchItem<"sqlite">[] = [
    ctx.db
      .update(tenants)
      .set({ name: input.tenantName, birthYear: input.birthYear, updatedAt: now })
      .where(
        and(eq(tenants.organizationId, ctx.organizationId), eq(tenants.id, lease.tenantId)),
      ),
    ctx.db
      .update(leases)
      .set({
        contractDate: input.contractDate,
        nextRenewalDate: input.nextRenewalDate,
        updatedAt: now,
      })
      .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, lease.id))),
  ];

  // 契約日を直したら、契約時の家賃改定（initial）の適用開始日も同じ日に動かす
  if (input.contractDate !== lease.contractDate) {
    writes.push(
      ctx.db
        .update(rentRevisions)
        .set({ effectiveFrom: input.contractDate, updatedAt: now })
        .where(
          and(
            eq(rentRevisions.organizationId, ctx.organizationId),
            eq(rentRevisions.leaseId, lease.id),
            eq(rentRevisions.reason, "initial"),
          ),
        ),
    );
  }

  // 次回更新予定日を直したら、未完了の更新手続きの予定日も揃える
  if (input.nextRenewalDate) {
    writes.push(
      ctx.db
        .update(procedures)
        .set({ scheduledOn: input.nextRenewalDate, updatedAt: now })
        .where(
          and(
            eq(procedures.organizationId, ctx.organizationId),
            eq(procedures.leaseId, lease.id),
            eq(procedures.type, "renewal"),
            ne(procedures.status, "done"),
          ),
        ),
    );
  }

  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  if (input.rent !== null) {
    await correctCurrentRent(ctx, lease.id, input.rent);
  }
}

/**
 * 現在の家賃を訂正する。
 * 新しい改定を作らず、**最新の確定済み改定の金額を書き換える**。
 * 「入力を間違えた」を直すための操作なので、履歴を増やしてはいけない。
 */
async function correctCurrentRent(
  ctx: OrgContext,
  leaseId: string,
  amount: number,
): Promise<void> {
  const [latest] = await ctx.db
    .select({ id: rentRevisions.id, amount: rentRevisions.amount })
    .from(rentRevisions)
    .where(
      and(
        eq(rentRevisions.organizationId, ctx.organizationId),
        eq(rentRevisions.leaseId, leaseId),
        eq(rentRevisions.confirmed, true),
      ),
    )
    .orderBy(desc(rentRevisions.effectiveFrom))
    .limit(1);

  if (!latest || latest.amount === amount) return;

  await ctx.db
    .update(rentRevisions)
    .set({ amount, updatedAt: new Date() })
    .where(
      and(
        eq(rentRevisions.organizationId, ctx.organizationId),
        eq(rentRevisions.id, latest.id),
      ),
    );
}
