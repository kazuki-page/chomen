import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, isNull } from "drizzle-orm";

import { addYears, todayInTokyo, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { templateFor, type ProcedureType } from "../procedure-templates";
import { leases, procedureItems, procedures, rentRevisions, units } from "../schema";

type Writes = BatchItem<"sqlite">[];

/**
 * チェック項目の状態を更新する。
 *
 * 全項目が完了したら手続きを完了とし、**自動化ルールを連鎖実行する**。
 * 操作者がステータスを手で選ぶ操作は発生させない（要件定義 4.4）。
 *
 * D1 には対話的トランザクションが無いため、一連の書き込みは batch() で
 * まとめて実行する（batch は原子的に適用される）。
 */
export async function setItemChecked(
  ctx: OrgContext,
  input: {
    procedureId: string;
    itemId: string;
    checked: boolean;
    valueText?: string | null;
    /** 更新手続きの「更新通知内容を決定」で入力される更新後家賃 */
    newRent?: number | null;
  },
): Promise<void> {
  const proc = await loadProcedure(ctx, input.procedureId);
  if (!proc) throw new Error("手続きが見つかりません");

  // 完了済みの手続きは編集させない（自動化ルールの巻き戻しが必要になるため）
  if (proc.status === "done") return;

  const now = new Date();
  const writes: Writes = [
    ctx.db
      .update(procedureItems)
      .set({
        checkedAt: input.checked ? now : null,
        valueText: input.valueText ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(procedureItems.organizationId, ctx.organizationId),
          eq(procedureItems.id, input.itemId),
          // 別の手続きの項目を書き換えられないよう、所属も一致させる
          eq(procedureItems.procedureId, input.procedureId),
        ),
      ),
  ];

  await runBatch(ctx, writes);

  // 「更新通知内容を決定」で家賃が入力されたら、予定の家賃改定を作る
  if (proc.type === "renewal" && input.checked && input.newRent != null) {
    await upsertPendingRentRevision(ctx, {
      procedureId: proc.id,
      leaseId: proc.leaseId,
      effectiveFrom: proc.scheduledOn ?? todayInTokyo(),
      amount: input.newRent,
    });
  }

  const remaining = await countUnchecked(ctx, proc.id);
  if (remaining === 0) {
    await completeProcedure(ctx, proc);
  } else {
    await ctx.db
      .update(procedures)
      .set({ status: "in_progress", updatedAt: now })
      .where(
        and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.id, proc.id)),
      );
  }
}

/**
 * 手続きの完了処理と、それに伴う自動化ルール。
 *
 * | トリガー   | 処理                                                            |
 * |-----------|-----------------------------------------------------------------|
 * | 入居完了   | 契約を有効化、部屋の募集情報をクリア、2年後の更新手続きを自動生成      |
 * | 更新完了   | 家賃改定を確定、次回更新日を更新、次回の更新手続きを自動生成           |
 * | 退居完了   | 契約を終了。部屋は「有効な契約が無い」ことで自動的に空室になる          |
 */
async function completeProcedure(ctx: OrgContext, proc: LoadedProcedure): Promise<void> {
  const now = new Date();
  const writes: Writes = [
    ctx.db
      .update(procedures)
      .set({ status: "done", completedAt: now, updatedAt: now })
      .where(
        and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.id, proc.id)),
      ),
  ];

  switch (proc.type) {
    case "move_in": {
      const renewalOn = addYears(proc.contractDate, 2);

      writes.push(
        ctx.db
          .update(leases)
          .set({ status: "active", nextRenewalDate: renewalOn, updatedAt: now })
          .where(
            and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, proc.leaseId)),
          ),
      );
      // 入居が決まったので募集を取り下げる（Notion では空室レコードを手で「過去」にしていた作業）
      writes.push(
        ctx.db
          .update(units)
          .set({ listingRent: null, listingStartedOn: null, updatedAt: now })
          .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, proc.unitId))),
      );
      writes.push(...buildProcedureInserts(ctx, proc.leaseId, "renewal", renewalOn));
      break;
    }

    case "renewal": {
      const base = proc.scheduledOn ?? proc.nextRenewalDate ?? proc.contractDate;
      const nextOn = addYears(base, 2);

      // 予定として作られていた家賃改定を確定させる
      writes.push(
        ctx.db
          .update(rentRevisions)
          .set({ confirmed: true, updatedAt: now })
          .where(
            and(
              eq(rentRevisions.organizationId, ctx.organizationId),
              eq(rentRevisions.procedureId, proc.id),
            ),
          ),
      );
      writes.push(
        ctx.db
          .update(leases)
          .set({ nextRenewalDate: nextOn, updatedAt: now })
          .where(
            and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, proc.leaseId)),
          ),
      );
      writes.push(...buildProcedureInserts(ctx, proc.leaseId, "renewal", nextOn));
      break;
    }

    case "move_out": {
      writes.push(
        ctx.db
          .update(leases)
          .set({
            status: "ended",
            endedOn: proc.scheduledOn ?? todayInTokyo(),
            nextRenewalDate: null,
            updatedAt: now,
          })
          .where(
            and(eq(leases.organizationId, ctx.organizationId), eq(leases.id, proc.leaseId)),
          ),
      );
      // 募集家賃・募集開始日はここでは設定しない。
      // いくらで募集するかは人が決めることなので、画面側で入力を促す。
      break;
    }
  }

  await runBatch(ctx, writes);
}

/**
 * 手続きを開始する。
 *
 * 退居の連絡が来たときなど、自動連鎖ではなく人が起点になる手続きに使う。
 * チェック項目はテンプレートから自動生成されるので、人が作る必要はない。
 */
export async function startProcedure(
  ctx: OrgContext,
  input: { leaseId: string; type: ProcedureType; scheduledOn: IsoDate },
): Promise<string> {
  const procedureId = crypto.randomUUID();
  await runBatch(
    ctx,
    buildProcedureInserts(ctx, input.leaseId, input.type, input.scheduledOn, procedureId),
  );
  return procedureId;
}

/** 次の手続きとそのチェック項目を作る INSERT 群 */
function buildProcedureInserts(
  ctx: OrgContext,
  leaseId: string,
  type: ProcedureType,
  scheduledOn: IsoDate,
  id: string = crypto.randomUUID(),
): Writes {
  const procedureId = id;
  const template = templateFor(type);

  const writes: Writes = [
    ctx.db.insert(procedures).values({
      id: procedureId,
      organizationId: ctx.organizationId,
      leaseId,
      type,
      status: "todo",
      scheduledOn,
    }),
  ];

  template.items.forEach((item, index) => {
    writes.push(
      ctx.db.insert(procedureItems).values({
        organizationId: ctx.organizationId,
        procedureId,
        key: item.key,
        label: item.label,
        sortOrder: index,
      }),
    );
  });

  return writes;
}

async function upsertPendingRentRevision(
  ctx: OrgContext,
  input: { procedureId: string; leaseId: string; effectiveFrom: IsoDate; amount: number },
): Promise<void> {
  const [existing] = await ctx.db
    .select({ id: rentRevisions.id })
    .from(rentRevisions)
    .where(
      and(
        eq(rentRevisions.organizationId, ctx.organizationId),
        eq(rentRevisions.procedureId, input.procedureId),
      ),
    );

  if (existing) {
    await ctx.db
      .update(rentRevisions)
      .set({ amount: input.amount, effectiveFrom: input.effectiveFrom, updatedAt: new Date() })
      .where(
        and(
          eq(rentRevisions.organizationId, ctx.organizationId),
          eq(rentRevisions.id, existing.id),
        ),
      );
    return;
  }

  await ctx.db.insert(rentRevisions).values({
    organizationId: ctx.organizationId,
    leaseId: input.leaseId,
    effectiveFrom: input.effectiveFrom,
    amount: input.amount,
    reason: "renewal",
    procedureId: input.procedureId,
    confirmed: false,
  });
}

type LoadedProcedure = {
  id: string;
  type: ProcedureType;
  status: "todo" | "in_progress" | "done";
  scheduledOn: IsoDate | null;
  leaseId: string;
  unitId: string;
  contractDate: IsoDate;
  nextRenewalDate: IsoDate | null;
};

async function loadProcedure(
  ctx: OrgContext,
  procedureId: string,
): Promise<LoadedProcedure | null> {
  const [row] = await ctx.db
    .select({
      id: procedures.id,
      type: procedures.type,
      status: procedures.status,
      scheduledOn: procedures.scheduledOn,
      leaseId: leases.id,
      unitId: leases.unitId,
      contractDate: leases.contractDate,
      nextRenewalDate: leases.nextRenewalDate,
    })
    .from(procedures)
    .innerJoin(leases, eq(leases.id, procedures.leaseId))
    .where(
      and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.id, procedureId)),
    );

  return row ?? null;
}

async function countUnchecked(ctx: OrgContext, procedureId: string): Promise<number> {
  const rows = await ctx.db
    .select({ id: procedureItems.id })
    .from(procedureItems)
    .where(
      and(
        eq(procedureItems.organizationId, ctx.organizationId),
        eq(procedureItems.procedureId, procedureId),
        isNull(procedureItems.checkedAt),
      ),
    );
  return rows.length;
}

async function runBatch(ctx: OrgContext, writes: Writes): Promise<void> {
  if (writes.length === 0) return;
  await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
