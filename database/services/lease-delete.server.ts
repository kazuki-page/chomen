import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray, ne } from "drizzle-orm";

import type { OrgContext } from "../context.server";
import { leases, procedureItems, procedures, rentRevisions, tenants } from "../schema";

export type DeleteLeaseResult = {
  unitId: string;
  tenantName: string;
  /** 一緒に消えたもの。画面で「何が消えたか」を伝えるために返す */
  procedures: number;
  rentRevisions: number;
};

/**
 * 契約を削除する。**打ち間違い・二重登録を消すための機能**であって、退居ではない。
 *
 * 退居は「退居手続き」を踏んで契約を終了させるもので、履歴は残る。
 * こちらは履歴ごと消す。誤って入れたデータは残しておくと台帳が嘘になるため、
 * 取り消せる手段が要る。
 *
 * ぶら下がっているものは明示的に消す。
 * D1 の外部キーの挙動（cascade が効くか）に依存させたくない。
 * 順番は子から親へ。手続きの項目 → 手続き → 家賃改定 → 契約 → 入居者。
 *
 * 入居者は**他の契約から参照されていないときだけ**消す。
 * 部屋と駐車場を同じ人が借りている場合に、片方を消して相手方が壊れると困る。
 */
export async function deleteLease(
  ctx: OrgContext,
  leaseId: string,
): Promise<DeleteLeaseResult> {
  const [lease] = await ctx.db
    .select({
      id: leases.id,
      unitId: leases.unitId,
      tenantId: leases.tenantId,
      tenantName: tenants.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, leaseId)));

  if (!lease) throw new Response("契約が見つかりません", { status: 404 });

  const procedureRows = await ctx.db
    .select({ id: procedures.id })
    .from(procedures)
    .where(
      and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.leaseId, lease.id)),
    );

  const revisionRows = await ctx.db
    .select({ id: rentRevisions.id })
    .from(rentRevisions)
    .where(
      and(
        eq(rentRevisions.organizationId, ctx.organizationId),
        eq(rentRevisions.leaseId, lease.id),
      ),
    );

  // 同じ入居者を参照している別の契約があるか
  const otherLeases = await ctx.db
    .select({ id: leases.id })
    .from(leases)
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.tenantId, lease.tenantId),
        ne(leases.id, lease.id),
      ),
    )
    .limit(1);

  const writes: BatchItem<"sqlite">[] = [];

  if (procedureRows.length > 0) {
    writes.push(
      ctx.db.delete(procedureItems).where(
        and(
          eq(procedureItems.organizationId, ctx.organizationId),
          inArray(
            procedureItems.procedureId,
            procedureRows.map((p) => p.id),
          ),
        ),
      ),
    );
  }

  writes.push(
    ctx.db
      .delete(procedures)
      .where(
        and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.leaseId, lease.id)),
      ),
    ctx.db
      .delete(rentRevisions)
      .where(
        and(
          eq(rentRevisions.organizationId, ctx.organizationId),
          eq(rentRevisions.leaseId, lease.id),
        ),
      ),
    ctx.db
      .delete(leases)
      .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, lease.id))),
  );

  if (otherLeases.length === 0) {
    writes.push(
      ctx.db
        .delete(tenants)
        .where(
          and(eq(tenants.organizationId, ctx.organizationId), eq(tenants.id, lease.tenantId)),
        ),
    );
  }

  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return {
    unitId: lease.unitId,
    tenantName: lease.tenantName,
    procedures: procedureRows.length,
    rentRevisions: revisionRows.length,
  };
}
