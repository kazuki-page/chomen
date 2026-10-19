import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { createOrgContext } from "../context.server";
import { buildings, leases, organizations, procedureItems, procedures, rentRevisions, tenants, units } from "../schema";
import { buildProcedureInserts, restoreMissingRenewal } from "../services/procedures.server";
import { registerExistingLease } from "../services/leases.server";
import { getRenewalRecoveryCandidate, guardRenewalRecovery } from "./renewal-recovery.server";
import { listRenewals } from "./renewals.server";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function seed() {
  const ctx = createOrgContext(env.DB, "org-a");
  await ctx.db.insert(organizations).values({ id: "org-a", name: "架空組織" });
  await ctx.db.insert(buildings).values({ id: "b", organizationId: "org-a", name: "架空建物" });
  await ctx.db.insert(units).values({ id: "u", organizationId: "org-a", buildingId: "b", type: "room", code: "301" });
  await ctx.db.insert(tenants).values({ id: "t", organizationId: "org-a", name: "架空入居者" });
  await ctx.db.insert(leases).values({ id: "l", organizationId: "org-a", unitId: "u", tenantId: "t", contractDate: "2020-07-11", nextRenewalDate: "2028-07-11" });
  return ctx;
}

it("欠落した更新をチェック項目付きで復元し、繰り返しても二重に作らず家賃履歴を保持する", async () => {
  const ctx = await seed();
  await ctx.db.insert(rentRevisions).values({ id: "r", organizationId: "org-a", leaseId: "l", effectiveFrom: "2026-07-11", amount: 40000, reason: "renewal", confirmed: true });
  const before = await ctx.db.select().from(rentRevisions);
  expect(await listRenewals(ctx)).toEqual([]);
  await restoreMissingRenewal(ctx, "u");
  await restoreMissingRenewal(ctx, "u");
  expect(await listRenewals(ctx)).toEqual([expect.objectContaining({ unitCode: "301", renewalDate: "2028-07-11", rentBefore: 40000 })]);
  expect(await ctx.db.select().from(procedureItems)).toHaveLength(4);
  expect(await ctx.db.select().from(rentRevisions)).toEqual(before);
  expect(await getRenewalRecoveryCandidate(ctx, "u")).toBeNull();
});

it("他組織、終了・入居手続き中、日付なし、未完了の退居・更新を復元しない", async () => {
  const ctx = await seed();
  await restoreMissingRenewal(createOrgContext(env.DB, "org-b"), "u");
  for (const status of ["ended", "pending"] as const) {
    await ctx.db.update(leases).set({ status });
    expect(await getRenewalRecoveryCandidate(ctx, "u")).toBeNull();
  }
  await ctx.db.update(leases).set({ status: "active", nextRenewalDate: null });
  expect(await getRenewalRecoveryCandidate(ctx, "u")).toBeNull();
  await ctx.db.update(leases).set({ nextRenewalDate: "2028-07-11" });
  for (const type of ["move_out", "renewal"] as const) {
    for (const status of ["todo", "in_progress"] as const) {
      await ctx.db.insert(procedures).values({ id: "p", organizationId: "org-a", leaseId: "l", type, status });
      await restoreMissingRenewal(ctx, "u");
      expect(await ctx.db.select().from(procedures)).toHaveLength(1);
      await ctx.db.delete(procedures);
    }
  }
  await ctx.db.insert(procedures).values({ id: "done", organizationId: "org-a", leaseId: "l", type: "renewal", status: "done" });
  await restoreMissingRenewal(ctx, "u");
  expect(await ctx.db.select().from(procedures)).toHaveLength(2);
});

it("読み取り後に更新が作られた場合、再検証でバッチ全体を拒否する", async () => {
  const ctx = await seed();
  const candidate = (await getRenewalRecoveryCandidate(ctx, "u"))!;
  await restoreMissingRenewal(ctx, "u");
  const writes = buildProcedureInserts(ctx, "l", "renewal", "2028-07-11");
  await expect(ctx.db.batch([guardRenewalRecovery(ctx, candidate), ...writes])).rejects.toThrow();
  expect(await ctx.db.select().from(procedures)).toHaveLength(1);
  expect(await ctx.db.select().from(procedureItems)).toHaveLength(4);
});

it("契約登録で更新の作成に失敗した場合、契約・入居者・家賃も保存しない", async () => {
  const ctx = await seed();
  await ctx.db.delete(leases);
  await ctx.db.delete(tenants);
  await env.DB.exec("CREATE TRIGGER fail_renewal BEFORE INSERT ON procedures BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await expect(registerExistingLease(ctx, { unitId: "u", tenantName: "架空入居者", birthYear: null, contractDate: "2020-07-11", nextRenewalDate: "2028-07-11", rent: 40000 })).rejects.toThrow();
  expect(await ctx.db.select().from(leases)).toHaveLength(0);
  expect(await ctx.db.select().from(tenants)).toHaveLength(0);
  expect(await ctx.db.select().from(rentRevisions)).toHaveLength(0);
});
