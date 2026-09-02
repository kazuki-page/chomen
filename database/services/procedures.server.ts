import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { addYears, todayInTokyo, type IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { templateFor, type ProcedureType } from "../procedure-templates";
import { leaseExists } from "../repositories/procedures.server";
import {
  leases,
  procedureItems,
  procedures,
  rentRevisions,
  units,
} from "../schema";

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
        and(
          eq(procedures.organizationId, ctx.organizationId),
          eq(procedures.id, proc.id),
        ),
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
 * | 退居開始   | 来ないと決まった更新手続きを取り消す（startProcedure 側）              |
 * | 退居完了   | 契約を終了。部屋は「有効な契約が無い」ことで自動的に空室になる          |
 */
async function completeProcedure(
  ctx: OrgContext,
  proc: LoadedProcedure,
): Promise<void> {
  const now = new Date();
  const writes: Writes = [
    ctx.db
      .update(procedures)
      .set({ status: "done", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(procedures.organizationId, ctx.organizationId),
          eq(procedures.id, proc.id),
        ),
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
            and(
              eq(leases.organizationId, ctx.organizationId),
              eq(leases.id, proc.leaseId),
            ),
          ),
      );
      // 入居が決まったので募集を取り下げる（Notion では空室レコードを手で「過去」にしていた作業）
      writes.push(
        ctx.db
          .update(units)
          .set({ listingRent: null, listingStartedOn: null, updatedAt: now })
          .where(
            and(
              eq(units.organizationId, ctx.organizationId),
              eq(units.id, proc.unitId),
            ),
          ),
      );
      writes.push(
        ...buildProcedureInserts(ctx, proc.leaseId, "renewal", renewalOn),
      );
      writes.push(...(await endPreviousLease(ctx, proc, now)));
      break;
    }

    case "renewal": {
      const base =
        proc.scheduledOn ?? proc.nextRenewalDate ?? proc.contractDate;
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
            and(
              eq(leases.organizationId, ctx.organizationId),
              eq(leases.id, proc.leaseId),
            ),
          ),
      );
      writes.push(
        ...buildProcedureInserts(ctx, proc.leaseId, "renewal", nextOn),
      );
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
            and(
              eq(leases.organizationId, ctx.organizationId),
              eq(leases.id, proc.leaseId),
            ),
          ),
      );
      // 通常は退居手続きの開始時に消えている。ここは取りこぼしの受け皿で、
      // この変更より前に始まった退居手続きを完了させたときに効く
      writes.push(...(await cancelUnfinishedRenewals(ctx, proc.leaseId)));
      // 募集家賃・募集開始日はここでは設定しない。
      // いくらで募集するかは人が決めることなので、画面側で入力を促す。
      break;
    }
  }

  await runBatch(ctx, writes);
}

/**
 * 入居手続きの完了時に、その部屋に残っている前の契約を終了させる。
 *
 * 退居手続きが終わる前に次の入居者が決まることがある。そのまま完了させると
 * **1つの部屋に active な契約が2件**でき、部屋一覧が同じ部屋を二重に並べる
 * （一覧は active を1件だけ引く前提の JOIN になっている）。
 *
 * **退居手続きは未完のまま残す。** ホーム画面の「やること」は手続きの状態だけを
 * 見ていて契約を参照しないので、契約を終えてもやり残しは消えない。
 * 部屋の見た目だけが新しい入居者に入れ替わり、退居の残作業は残り続ける。
 *
 * 退去日は退居手続きの予定日を借りておく。手続きが完了した時点で
 * 正式な退去日に上書きされるため、ここでの値は暫定でよい。
 */
async function endPreviousLease(
  ctx: OrgContext,
  proc: LoadedProcedure,
  now: Date,
): Promise<Writes> {
  const rows = await ctx.db
    .select({ id: leases.id, scheduledOn: procedures.scheduledOn })
    .from(leases)
    .leftJoin(
      procedures,
      and(eq(procedures.leaseId, leases.id), eq(procedures.type, "move_out")),
    )
    .where(
      and(
        eq(leases.organizationId, ctx.organizationId),
        eq(leases.unitId, proc.unitId),
        eq(leases.status, "active"),
        ne(leases.id, proc.leaseId),
      ),
    )
    .orderBy(desc(procedures.scheduledOn));

  // 退居手続きが複数ぶら下がっていると JOIN が同じ契約を何度も返す。
  // 予定日の新しいものを採用する
  const latest = new Map<string, string | null>();
  for (const row of rows) {
    if (!latest.has(row.id)) latest.set(row.id, row.scheduledOn);
  }

  const writes: Writes = [];
  for (const [leaseId, scheduledOn] of latest) {
    writes.push(
      ctx.db
        .update(leases)
        .set({
          status: "ended",
          endedOn: scheduledOn ?? proc.contractDate,
          nextRenewalDate: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(leases.organizationId, ctx.organizationId),
            eq(leases.id, leaseId),
          ),
        ),
    );
    writes.push(...(await cancelUnfinishedRenewals(ctx, leaseId)));
  }
  return writes;
}

/**
 * 退居手続きを取り消す。**誤って始めたときの取り消し用。**
 *
 * 退居の連絡が来た時点で更新手続きを消しているため、始めた側だけを消すと
 * 契約に手続きが1つも無い状態になり、次回更新が永久に来なくなる。
 * そこで**更新手続きを作り直す。** 予定日は契約が持っている次回更新日を使う。
 *
 * 作り直したチェックリストは白紙になる。取り消した退居手続きの内容も、
 * 更新手続きに入っていた「更新通知内容を決定」の予定家賃も戻らない。
 * 消えたものを装って中途半端に復元するより、入れ直してもらうほうが確か。
 *
 * 完了した退居手続きは取り消せない。契約の終了や空室化まで巻き戻す必要があり、
 * それは「契約を削除する」の領分（履歴ごと消す）になる。
 */
export async function cancelMoveOut(
  ctx: OrgContext,
  procedureId: string,
): Promise<{ unitId: string }> {
  const proc = await loadProcedure(ctx, procedureId);
  if (!proc) throw new Response("手続きが見つかりません", { status: 404 });
  if (proc.type !== "move_out") {
    throw new Response("退居手続きではありません", { status: 400 });
  }
  if (proc.status === "done") {
    throw new Response("完了した退居手続きは取り消せません", { status: 400 });
  }

  const writes: Writes = [
    ctx.db
      .delete(procedureItems)
      .where(
        and(
          eq(procedureItems.organizationId, ctx.organizationId),
          eq(procedureItems.procedureId, proc.id),
        ),
      ),
    ctx.db
      .delete(procedures)
      .where(
        and(
          eq(procedures.organizationId, ctx.organizationId),
          eq(procedures.id, proc.id),
        ),
      ),
  ];

  // 退居の開始時に消した更新手続きを戻す。
  // すでに何らかの更新手続きが居るなら二重に作らない
  const existing = await ctx.db
    .select({ id: procedures.id })
    .from(procedures)
    .where(
      and(
        eq(procedures.organizationId, ctx.organizationId),
        eq(procedures.leaseId, proc.leaseId),
        eq(procedures.type, "renewal"),
        ne(procedures.status, "done"),
      ),
    )
    .limit(1);

  if (existing.length === 0 && proc.nextRenewalDate) {
    writes.push(
      ...buildProcedureInserts(
        ctx,
        proc.leaseId,
        "renewal",
        proc.nextRenewalDate,
      ),
    );
  }

  await runBatch(ctx, writes);
  return { unitId: proc.unitId };
}

/**
 * **行われないと決まった更新手続きを取り消す。**
 *
 * 呼ぶのは2か所。**退居手続きの開始時**（退去が決まった時点で更新は無くなる）と、
 * 入居手続きの完了で前の契約を切り替えるとき。
 *
 * 更新手続きは入居や前回更新の完了時に2年先ぶんが自動で作られる。
 * 退去する人の更新は来ないが、放っておくと2つの形で邪魔になる。
 *   - 部屋の手続き一覧に「次回更新」と「退居」が並び、どちらに従うのか分からない
 *   - ホーム画面の「やること」は `procedures.status != 'done'` しか見ていないため、
 *     退去した入居者の名前が残り続ける。放置に気づかせるための画面が、
 *     対応できない項目で埋まる
 *
 * 完了済みの更新手続きには触らない。実際に行われた更新の履歴なので残す。
 *
 * 「更新通知内容を決定」で作られた**予定の**家賃改定も一緒に消す。
 * 手続きを消して改定だけ残すと、来ない更新の金額が家賃の履歴に居座る。
 * 確定済みの改定は実際に適用された金額なので残す。
 */
async function cancelUnfinishedRenewals(
  ctx: OrgContext,
  leaseId: string,
): Promise<Writes> {
  const rows = await ctx.db
    .select({ id: procedures.id })
    .from(procedures)
    .where(
      and(
        eq(procedures.organizationId, ctx.organizationId),
        eq(procedures.leaseId, leaseId),
        eq(procedures.type, "renewal"),
        ne(procedures.status, "done"),
      ),
    );

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // 子から親へ。D1 の外部キーの挙動に依存させない（契約の削除と同じ方針）
  return [
    ctx.db
      .delete(procedureItems)
      .where(
        and(
          eq(procedureItems.organizationId, ctx.organizationId),
          inArray(procedureItems.procedureId, ids),
        ),
      ),
    ctx.db
      .delete(rentRevisions)
      .where(
        and(
          eq(rentRevisions.organizationId, ctx.organizationId),
          inArray(rentRevisions.procedureId, ids),
          eq(rentRevisions.confirmed, false),
        ),
      ),
    ctx.db
      .delete(procedures)
      .where(
        and(
          eq(procedures.organizationId, ctx.organizationId),
          inArray(procedures.id, ids),
        ),
      ),
  ];
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
  if (!(await leaseExists(ctx, input.leaseId))) {
    throw new Error("契約が見つかりません");
  }

  const procedureId = crypto.randomUUID();
  const writes = buildProcedureInserts(
    ctx,
    input.leaseId,
    input.type,
    input.scheduledOn,
    procedureId,
  );

  /*
   * 退去が決まった時点で更新は無くなる。**完了を待たない。**
   * 待つと、その部屋の手続きに「次回更新」と「退居」が同時に並び、
   * どちらに従えばいいのか読み取れない画面になる。
   */
  if (input.type === "move_out") {
    writes.push(...(await cancelUnfinishedRenewals(ctx, input.leaseId)));
  }

  await runBatch(ctx, writes);
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
  input: {
    procedureId: string;
    leaseId: string;
    effectiveFrom: IsoDate;
    amount: number;
  },
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
      .set({
        amount: input.amount,
        effectiveFrom: input.effectiveFrom,
        updatedAt: new Date(),
      })
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
      and(
        eq(procedures.organizationId, ctx.organizationId),
        eq(procedures.id, procedureId),
      ),
    );

  return row ?? null;
}

async function countUnchecked(
  ctx: OrgContext,
  procedureId: string,
): Promise<number> {
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
