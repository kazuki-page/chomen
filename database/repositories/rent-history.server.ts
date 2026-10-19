import { and, eq, sql } from "drizzle-orm";
import type { OrgContext } from "../context.server";
import { leases } from "../schema";

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

/** 過去の記録を確定家賃として追加する。契約や更新手続きは作らない。 */
export async function addPastRentRevision(ctx: OrgContext, input: {
  unitId: string; leaseId: string; effectiveFrom: string; amount: string; reason: string;
  asOf: string; now: Date;
}): Promise<Result> {
  if (!validDate(input.effectiveFrom) || input.effectiveFrom > input.asOf) {
    return fail("適用日は今日以前の正しい日付を入力してください。");
  }
  const amountText = input.amount.trim();
  const amount = Number(amountText);
  if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount)) {
    return fail("家賃は0円以上の整数で入力してください。");
  }
  if (!["initial", "renewal", "adjustment"].includes(input.reason)) {
    return fail("家賃の事由を選んでください。");
  }
  const [lease] = await ctx.db.select({ contractDate: leases.contractDate, endedOn: leases.endedOn, status: leases.status })
    .from(leases).where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.unitId, input.unitId), eq(leases.id, input.leaseId)));
  if (!lease || lease.status === "pending") return fail("この部屋の入居中または退居済みの契約を選んでください。");
  if (input.effectiveFrom < lease.contractDate || (lease.endedOn && input.effectiveFrom > lease.endedOn)) {
    return fail("適用日は、選んだ契約の契約日から退居日までの範囲で入力してください。");
  }
  if (input.reason === "initial" && input.effectiveFrom !== lease.contractDate) {
    return fail("新規契約の家賃は契約日を適用日にしてください。");
  }
  // 1つの条件付きINSERTで、並行した同日追加・契約の変更・手続きとの競合も防ぐ。
  const result = await ctx.db.run(sql`insert into rent_revisions
    (id, organization_id, lease_id, effective_from, amount, reason, procedure_id, confirmed, created_at, updated_at)
    select ${crypto.randomUUID()}, ${ctx.organizationId}, l.id, ${input.effectiveFrom}, ${amount}, ${input.reason}, null, 1, ${input.now.getTime()}, ${input.now.getTime()}
    from leases l where l.organization_id = ${ctx.organizationId} and l.unit_id = ${input.unitId} and l.id = ${input.leaseId}
      and l.status in ('active', 'ended') and l.contract_date = ${lease.contractDate}
      and l.ended_on is ${lease.endedOn}
      and not exists (select 1 from rent_revisions r where r.organization_id = ${ctx.organizationId}
        and r.lease_id = l.id and r.effective_from = ${input.effectiveFrom})
      and not exists (select 1 from procedures p where p.organization_id = ${ctx.organizationId}
        and p.lease_id = l.id and p.type = 'renewal' and p.status != 'done' and p.scheduled_on = ${input.effectiveFrom})`);
  return result.meta.changes === 1 ? { ok: true } : fail("同じ日の家賃記録・進行中の更新手続きがあるか、契約が変更されています。再読み込みして確認してください。");
}

/** 確認した記録1件だけを削除する。未確定・進行中手続きの記録は削除しない。 */
export async function deleteRentRevision(ctx: OrgContext, input: {
  unitId: string; revisionId: string; effectiveFrom: string; amount: string; version: string;
}): Promise<Result> {
  if (!/^\d+$/.test(input.version) || !/^\d+$/.test(input.amount)
    || !Number.isSafeInteger(Number(input.version)) || !Number.isSafeInteger(Number(input.amount))) {
    return fail("記録を再読み込みしてから、削除する内容を確認してください。");
  }
  // 画面で確認した日付・金額・版と一致する場合だけ削除する。
  const result = await ctx.db.run(sql`delete from rent_revisions
    where organization_id = ${ctx.organizationId} and id = ${input.revisionId}
      and effective_from = ${input.effectiveFrom} and amount = ${Number(input.amount)} and updated_at = ${Number(input.version)}
      and confirmed = 1
      and exists (select 1 from leases l where l.organization_id = ${ctx.organizationId}
        and l.id = rent_revisions.lease_id and l.unit_id = ${input.unitId} and l.status in ('active', 'ended'))
      and not exists (select 1 from procedures p where p.organization_id = ${ctx.organizationId}
        and p.id = rent_revisions.procedure_id and p.status != 'done')`);
  return result.meta.changes === 1 ? { ok: true } : fail("削除できませんでした。記録が変更・削除されたか、手続きで使用中です。再読み込みして確認してください。");
}
