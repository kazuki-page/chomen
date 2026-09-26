import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { createOrgContext } from "../context.server";
import { buildings, leases, organizations, procedures, rentRevisions, tenants, units } from "../schema";
import { registerExistingLease, registerPastLease } from "../services/leases.server";
import { listRenewals } from "./renewals.server";
import { listRenewalRepairCandidates, repairRenewalHistory } from "./lease-history-repair.server";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function seed(sourceRent: number | null = 70000, targetRent: number | null = 72000) {
  const ctx = createOrgContext(env.DB, "repair-org");
  await ctx.db.insert(organizations).values({ id: ctx.organizationId, name: "架空組織" });
  await ctx.db.insert(buildings).values({ id: "building", organizationId: ctx.organizationId, name: "架空建物" });
  await ctx.db.insert(units).values({ id: "unit", organizationId: ctx.organizationId, buildingId: "building", type: "room", code: "999" });
  const base = { unitId: "unit", tenantName: "架空入居者", birthYear: 1980 };
  const source = await registerPastLease(ctx, { ...base, contractDate: "2020-03-01", rent: sourceRent, endedOn: "2022-02-28" });
  const target = await registerExistingLease(ctx, { ...base, contractDate: "2022-03-01", rent: targetRent, nextRenewalDate: "2028-03-01" });
  const input = { unitId: "unit", sourceLeaseId: source.leaseId, targetLeaseId: target.leaseId, now: new Date("2026-09-23T00:00:00Z") };
  return { ctx, input };
}

it.each([72000, null])("過去の家賃が未登録でも統合し、不明な金額を作らない（現在家賃=%s）", async (targetRent) => {
  const { ctx, input } = await seed(null, targetRent);
  expect((await listRenewalRepairCandidates(ctx))[0].source.rent).toBeNull();
  const before = await ctx.db.select().from(procedures);
  expect(await repairRenewalHistory(ctx, input)).toEqual({ ok: true });
  const history = await ctx.db.select().from(rentRevisions);
  expect(history).toHaveLength(targetRent === null ? 0 : 1);
  if (targetRent !== null) expect(history[0]).toMatchObject({ amount: targetRent, effectiveFrom: "2022-03-01", reason: "renewal" });
  expect((await listRenewals(ctx))[0]).toMatchObject({ rentBefore: targetRent, increases: [] });
  expect((await ctx.db.select().from(leases))[0]).toMatchObject({ contractDate: "2020-03-01", nextRenewalDate: "2028-03-01" });
  expect(await ctx.db.select().from(procedures)).toEqual(before);
  expect(await listRenewalRepairCandidates(ctx)).toHaveLength(0);
});

it("別契約として取り込まれた更新をまとめ、値上げ履歴と事由を直し、現在の手続きを残す", async () => {
  const { ctx, input } = await seed();
  expect((await listRenewals(ctx))[0].increases).toEqual([]); // 元の不具合を再現
  expect(await listRenewalRepairCandidates(ctx)).toHaveLength(1);
  const before = await ctx.db.select().from(procedures);
  expect(await repairRenewalHistory(ctx, input)).toEqual({ ok: true });
  expect((await listRenewals(ctx))[0]).toMatchObject({ rentBefore: 72000, increases: [{ year: "2022", amount: 2000, rent: 72000 }] });
  const history = await ctx.db.select().from(rentRevisions);
  expect(history).toHaveLength(2);
  expect(history.every((r) => r.leaseId === input.targetLeaseId)).toBe(true);
  expect(history.find((r) => r.effectiveFrom === "2020-03-01")?.reason).toBe("initial");
  expect(history.find((r) => r.effectiveFrom === "2022-03-01")?.reason).toBe("renewal");
  expect(await ctx.db.select().from(procedures)).toEqual(before);
  expect((await ctx.db.select().from(leases))[0]).toMatchObject({ contractDate: "2020-03-01", nextRenewalDate: "2028-03-01" });
  expect(await listRenewalRepairCandidates(ctx)).toHaveLength(0);
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false); // 二重送信でも再変更しない
});

it("別組織・別部屋から修正できない", async () => {
  const { ctx, input } = await seed();
  expect((await repairRenewalHistory(createOrgContext(env.DB, "other"), input)).ok).toBe(false);
  expect(await listRenewalRepairCandidates(createOrgContext(env.DB, "other"))).toEqual([]);
  expect((await repairRenewalHistory(ctx, { ...input, unitId: "other-unit" })).ok).toBe(false);
  expect(await ctx.db.select().from(leases)).toHaveLength(2);
});

it("氏名・生年が違う人、手続きのある過去契約、未確定家賃は修正しない", async () => {
  const { ctx, input } = await seed();
  const [source] = await ctx.db.select().from(leases).where(eq(leases.id, input.sourceLeaseId));
  await ctx.db.update(tenants).set({ birthYear: 1970 }).where(eq(tenants.id, source.tenantId));
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false);
  await ctx.db.update(tenants).set({ birthYear: 1980, name: "別の架空入居者" }).where(eq(tenants.id, source.tenantId));
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false);
  await ctx.db.update(tenants).set({ name: "架空入居者" }).where(eq(tenants.id, source.tenantId));
  await ctx.db.update(rentRevisions).set({ confirmed: false }).where(eq(rentRevisions.leaseId, source.id));
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false);
  await ctx.db.update(rentRevisions).set({ confirmed: true }).where(eq(rentRevisions.leaseId, source.id));
  await ctx.db.insert(procedures).values({ organizationId: ctx.organizationId, leaseId: source.id, type: "renewal", status: "done" });
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false);
  expect(await ctx.db.select().from(leases)).toHaveLength(2);
});

it("直前の契約だけをまとめ、さらに古い更新も順にまとめられる", async () => {
  const { ctx, input } = await seed();
  const older = await registerPastLease(ctx, { unitId: "unit", tenantName: "架空入居者", birthYear: 1980, contractDate: "2018-03-01", rent: 68000, endedOn: "2020-02-29" });
  expect((await repairRenewalHistory(ctx, { ...input, sourceLeaseId: older.leaseId })).ok).toBe(false);
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(true);
  expect((await repairRenewalHistory(ctx, { ...input, sourceLeaseId: older.leaseId })).ok).toBe(true);
  expect((await listRenewals(ctx))[0].increases).toEqual([{ year: "2022", amount: 2000, rent: 72000 }, { year: "2020", amount: 2000, rent: 70000 }]);
});

it("読み取り後に手続きが追加されたらバッチ全体を中止する", async () => {
  const { ctx, input } = await seed();
  const batch = ctx.db.batch.bind(ctx.db);
  vi.spyOn(ctx.db, "batch").mockImplementationOnce(async (queries) => {
    await ctx.db.insert(procedures).values({ organizationId: ctx.organizationId, leaseId: input.sourceLeaseId, type: "renewal", status: "done" });
    return batch(queries);
  });
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(false);
  expect(await ctx.db.select().from(leases)).toHaveLength(2);
  expect((await ctx.db.select().from(rentRevisions)).some((r) => r.leaseId === input.sourceLeaseId)).toBe(true);
});

it("100件を超える家賃履歴も金額・日付を保持してまとめる", async () => {
  const { ctx, input } = await seed();
  for (let i = 0; i < 105; i++) {
    await ctx.db.insert(rentRevisions).values({ organizationId: ctx.organizationId, leaseId: input.sourceLeaseId, effectiveFrom: "2021-01-01", amount: 70000, reason: "adjustment", confirmed: true });
  }
  expect((await repairRenewalHistory(ctx, input)).ok).toBe(true);
  const history = await ctx.db.select().from(rentRevisions);
  expect(history).toHaveLength(107);
  expect(history.every((r) => r.leaseId === input.targetLeaseId)).toBe(true);
});
