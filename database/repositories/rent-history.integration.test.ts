import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createOrgContext } from "../context.server";
import { buildings, leases, organizations, procedures, rentRevisions, tenants, units } from "../schema";
import { addPastRentRevision, deleteRentRevision } from "./rent-history.server";
import { getUnitDetail, listRentHistoryForUnit } from "./units.server";
import { listRenewals } from "./renewals.server";

beforeEach(async () => { await reset(); await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
const now = new Date("2026-10-19T00:00:00Z");
const input = { unitId: "u", leaseId: "l", effectiveFrom: "2024-07-11", amount: "42000", reason: "renewal", asOf: "2026-10-19", now };

async function seed() {
  const ctx = createOrgContext(env.DB, "org-a");
  await ctx.db.insert(organizations).values({ id: "org-a", name: "架空組織" });
  await ctx.db.insert(buildings).values({ id: "b", organizationId: "org-a", name: "架空建物" });
  await ctx.db.insert(units).values({ id: "u", organizationId: "org-a", buildingId: "b", type: "room", code: "101" });
  await ctx.db.insert(units).values({ id: "other-unit", organizationId: "org-a", buildingId: "b", type: "room", code: "102" });
  await ctx.db.insert(tenants).values({ id: "t", organizationId: "org-a", name: "架空入居者" });
  await ctx.db.insert(leases).values({ id: "l", organizationId: "org-a", unitId: "u", tenantId: "t", contractDate: "2020-07-11", nextRenewalDate: "2028-07-11" });
  await ctx.db.insert(procedures).values({ id: "p", organizationId: "org-a", leaseId: "l", type: "renewal", scheduledOn: "2028-07-11" });
  return ctx;
}

function deletion(row: Awaited<ReturnType<typeof listRentHistoryForUnit>>[number]) {
  return { unitId: "u", revisionId: row.id, effectiveFrom: row.effectiveFrom, amount: String(row.amount), version: String(row.version) };
}

it("過去家賃を正しい契約へ追加し、現在家賃と更新前家賃・値上げ履歴へ反映する", async () => {
  const ctx = await seed();
  expect(await addPastRentRevision(ctx, { ...input, effectiveFrom: "2020-07-11", amount: "40000", reason: "initial" })).toEqual({ ok: true });
  expect(await addPastRentRevision(ctx, input)).toEqual({ ok: true });
  expect((await getUnitDetail(ctx, "u", { asOf: input.asOf }))?.lease?.rent).toBe(42000);
  expect(await listRenewals(ctx)).toEqual([expect.objectContaining({ rentBefore: 42000, increases: [{ year: "2024", amount: 2000, rent: 42000 }] })]);
  const [revision] = await ctx.db.select().from(rentRevisions).where(eq(rentRevisions.effectiveFrom, input.effectiveFrom));
  expect(revision).toMatchObject({ leaseId: "l", confirmed: true, procedureId: null, createdAt: now, updatedAt: now });
  expect(await ctx.db.select().from(leases)).toHaveLength(1);
  expect(await ctx.db.select().from(procedures)).toHaveLength(1);
});

it("確認した1件だけを削除し、残った家賃で再計算する。最後の1件の削除は金額不明になる", async () => {
  const ctx = await seed();
  await addPastRentRevision(ctx, { ...input, effectiveFrom: "2020-07-11", amount: "40000", reason: "initial" });
  await addPastRentRevision(ctx, input);
  const [latest, oldest] = await listRentHistoryForUnit(ctx, "u");
  expect(latest.canDelete).toBe(true);
  expect(await deleteRentRevision(ctx, deletion(latest))).toEqual({ ok: true });
  expect((await getUnitDetail(ctx, "u", { asOf: input.asOf }))?.lease?.rent).toBe(40000);
  expect(await listRenewals(ctx)).toEqual([expect.objectContaining({ rentBefore: 40000, increases: [] })]);
  expect(await deleteRentRevision(ctx, deletion(oldest))).toEqual({ ok: true });
  expect((await getUnitDetail(ctx, "u", { asOf: input.asOf }))?.lease?.rent).toBeNull();
  expect(await listRenewals(ctx)).toEqual([expect.objectContaining({ rentBefore: null, increases: [] })]);
  expect(await ctx.db.select().from(leases)).toHaveLength(1);
  expect(await ctx.db.select().from(tenants)).toHaveLength(1);
  expect(await ctx.db.select().from(procedures)).toHaveLength(1);
  expect(await deleteRentRevision(ctx, deletion(oldest))).toHaveProperty("ok", false);
});

it("別組織・別部屋からの追加と削除を拒否する", async () => {
  const ctx = await seed();
  await addPastRentRevision(ctx, input);
  const [row] = await listRentHistoryForUnit(ctx, "u");
  const foreign = createOrgContext(env.DB, "org-b");
  expect(await addPastRentRevision(foreign, input)).toHaveProperty("ok", false);
  expect(await addPastRentRevision(ctx, { ...input, unitId: "other-unit" })).toHaveProperty("ok", false);
  expect(await deleteRentRevision(foreign, deletion(row))).toHaveProperty("ok", false);
  expect(await deleteRentRevision(ctx, { ...deletion(row), unitId: "other-unit" })).toHaveProperty("ok", false);
  expect(await listRentHistoryForUnit(foreign, "u")).toEqual([]);
  expect(await ctx.db.select().from(rentRevisions)).toHaveLength(1);
});

it("存在しない日付・未来日・不正金額・事由・契約期間外を拒否する", async () => {
  const ctx = await seed();
  for (const effectiveFrom of ["2026-02-29", "2024-02-30", "2024-13-01", "2024-00-01", "0000-01-01", "2024/01/01", "2026-10-20", "2020-07-10", ""]) {
    expect(await addPastRentRevision(ctx, { ...input, effectiveFrom }), effectiveFrom).toHaveProperty("ok", false);
  }
  for (const amount of ["", "-1", "1.5", "Infinity", "NaN", "1e3", "9007199254740992"]) {
    expect(await addPastRentRevision(ctx, { ...input, amount }), amount).toHaveProperty("ok", false);
  }
  expect(await addPastRentRevision(ctx, { ...input, reason: "done" })).toHaveProperty("ok", false);
  expect(await addPastRentRevision(ctx, { ...input, reason: "initial" })).toHaveProperty("ok", false);
  expect(await ctx.db.select().from(rentRevisions)).toHaveLength(0);
});

it("退居済みの家賃不明契約へ追加でき、退居日・閏日・0円を扱う", async () => {
  const ctx = await seed();
  await ctx.db.update(leases).set({ status: "ended", endedOn: "2024-02-29" });
  expect(await addPastRentRevision(ctx, { ...input, effectiveFrom: "2024-03-01" })).toHaveProperty("ok", false);
  expect(await addPastRentRevision(ctx, { ...input, effectiveFrom: "2024-02-29", amount: "0" })).toEqual({ ok: true });
  const [row] = await listRentHistoryForUnit(ctx, "u");
  expect(row.amount).toBe(0);
  expect(await deleteRentRevision(ctx, deletion(row))).toEqual({ ok: true });
  await ctx.db.update(leases).set({ endedOn: null });
  expect(await addPastRentRevision(ctx, input)).toEqual({ ok: true });
});

it("入居手続き中・進行中更新と同日の手入力・既存の予定家賃と同日の追加を拒否する", async () => {
  const ctx = await seed();
  await ctx.db.update(leases).set({ status: "pending" });
  expect(await addPastRentRevision(ctx, input)).toHaveProperty("ok", false);
  await ctx.db.update(leases).set({ status: "active" });
  await ctx.db.update(procedures).set({ scheduledOn: input.effectiveFrom });
  expect(await addPastRentRevision(ctx, input)).toHaveProperty("ok", false);
  await ctx.db.update(procedures).set({ status: "done" });
  await ctx.db.insert(rentRevisions).values({ organizationId: "org-a", leaseId: "l", effectiveFrom: input.effectiveFrom, amount: 40000, reason: "renewal", confirmed: false });
  expect(await addPastRentRevision(ctx, input)).toHaveProperty("ok", false);
});

it("同時送信でも同じ契約・同じ日に1件だけ追加する", async () => {
  const ctx = await seed();
  const results = await Promise.all([addPastRentRevision(ctx, input), addPastRentRevision(ctx, input)]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(await listRentHistoryForUnit(ctx, "u")).toHaveLength(1);
});

it("未確定・進行中手続きの家賃は削除できず、完了した手続き自体は削除しない", async () => {
  const ctx = await seed();
  await ctx.db.insert(rentRevisions).values({ id: "r", organizationId: "org-a", leaseId: "l", effectiveFrom: input.effectiveFrom, amount: 40000, reason: "renewal", confirmed: false, procedureId: "p" });
  let [row] = await listRentHistoryForUnit(ctx, "u");
  expect(row.canDelete).toBe(false);
  expect(await deleteRentRevision(ctx, deletion(row))).toHaveProperty("ok", false);
  await ctx.db.update(rentRevisions).set({ confirmed: true });
  [row] = await listRentHistoryForUnit(ctx, "u");
  expect(row.canDelete).toBe(false);
  expect(await deleteRentRevision(ctx, deletion(row))).toHaveProperty("ok", false);
  await ctx.db.update(procedures).set({ status: "done" });
  [row] = await listRentHistoryForUnit(ctx, "u");
  expect(row.canDelete).toBe(true);
  expect(await deleteRentRevision(ctx, deletion(row))).toEqual({ ok: true });
  expect(await ctx.db.select().from(procedures)).toHaveLength(1);
});

it("表示後に金額・日付・版が変わった記録を、古い確認内容で削除しない", async () => {
  const ctx = await seed();
  await addPastRentRevision(ctx, input);
  const [row] = await listRentHistoryForUnit(ctx, "u");
  expect(await deleteRentRevision(ctx, { ...deletion(row), amount: "42001" })).toHaveProperty("ok", false);
  expect(await deleteRentRevision(ctx, { ...deletion(row), effectiveFrom: "2024-07-10" })).toHaveProperty("ok", false);
  await ctx.db.update(rentRevisions).set({ updatedAt: new Date(now.getTime() + 1) });
  expect(await deleteRentRevision(ctx, deletion(row))).toHaveProperty("ok", false);
  expect(await listRentHistoryForUnit(ctx, "u")).toHaveLength(1);
});
