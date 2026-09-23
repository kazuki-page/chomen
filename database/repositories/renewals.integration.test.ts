import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { createOrgContext } from "../context.server";
import { buildings, leases, organizations, procedures, rentRevisions, tenants, units } from "../schema";
import { listRenewals } from "./renewals.server";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function seed(id: string, organizationId = "org-a", status: "active" | "ended" | "pending" = "active") {
  const ctx = createOrgContext(env.DB, organizationId);
  await ctx.db.insert(organizations).values({ id: organizationId, name: "架空組織" }).onConflictDoNothing();
  await ctx.db.insert(buildings).values({ id: `b-${organizationId}`, organizationId, name: "架空建物" }).onConflictDoNothing();
  await ctx.db.insert(units).values({ id: `u-${id}`, organizationId, buildingId: `b-${organizationId}`, type: "room", code: id });
  await ctx.db.insert(tenants).values({ id: `t-${id}`, organizationId, name: `架空入居者${id}` });
  await ctx.db.insert(leases).values({ id, organizationId, unitId: `u-${id}`, tenantId: `t-${id}`, contractDate: "2018-01-01", status });
  return ctx;
}

it("更新日前の確定家賃を求め、据え置き・値下げ・予定・当日以降を値上げ履歴に混ぜない", async () => {
  const ctx = await seed("a");
  await ctx.db.insert(procedures).values({ id: "p", organizationId: "org-a", leaseId: "a", type: "renewal", scheduledOn: "2026-10-01" });
  const history = [
    ["2018-01-01", 80000, true], ["2020-01-01", 82000, true],
    ["2021-01-01", 82000, true], ["2022-01-01", 79000, true],
    ["2024-01-01", 83000, true], ["2025-01-01", 99000, false],
    ["2026-10-01", 87000, true], ["2028-01-01", 90000, true],
  ] as const;
  for (const [date, amount, confirmed] of history) {
    await ctx.db.insert(rentRevisions).values({ organizationId: "org-a", leaseId: "a", effectiveFrom: date, amount, confirmed, reason: "adjustment" });
  }
  expect(await listRenewals(ctx)).toEqual([expect.objectContaining({
    rentBefore: 83000,
    increases: [{ year: "2024", amount: 4000, rent: 83000 }, { year: "2020", amount: 2000, rent: 82000 }],
  })]);
});

it("期限超過を含め日付順、日付未定は末尾。完了・別種別・終了契約・別組織を除く", async () => {
  const ctx = await seed("a");
  await seed("ended", "org-a", "ended");
  await seed("pending", "org-a", "pending");
  await seed("foreign", "org-b");
  for (const row of [
    { id: "future", scheduledOn: "2028-01-01" },
    { id: "undated", scheduledOn: null },
    { id: "overdue", scheduledOn: "2020-01-01" },
    { id: "progress", scheduledOn: "2026-10-01", status: "in_progress" as const },
    { id: "done", status: "done" as const },
    { id: "move-out", type: "move_out" as const },
    { id: "ended", leaseId: "ended" },
    { id: "pending", leaseId: "pending" },
    { id: "foreign", leaseId: "foreign", organizationId: "org-b" },
    { id: "cross-org", leaseId: "foreign" },
  ]) {
    await ctx.db.insert(procedures).values({ organizationId: "org-a", leaseId: "a", type: "renewal", ...row });
  }
  // 不整合な外部組織の家賃が同じ契約を指しても集計しない。
  await ctx.db.insert(rentRevisions).values({ organizationId: "org-b", leaseId: "a", effectiveFrom: "2019-01-01", amount: 123456, confirmed: true, reason: "initial" });
  const rows = await listRenewals(ctx);
  expect(rows.map((r) => r.procedureId)).toEqual(["overdue", "progress", "future", "undated"]);
  expect(rows.every((r) => r.rentBefore === null && r.increases.length === 0)).toBe(true);
  expect(await listRenewals(createOrgContext(env.DB, "empty"))).toEqual([]);
});

it("100件以上の更新でもバインド変数上限に依存せず、契約間の履歴を混ぜない", async () => {
  const ctx = await seed("a");
  await seed("b");
  await ctx.db.insert(rentRevisions).values({ organizationId: "org-a", leaseId: "b", effectiveFrom: "2020-01-01", amount: 50000, confirmed: true, reason: "initial" });
  for (let i = 0; i < 105; i++) {
    await ctx.db.insert(procedures).values({ id: `p-${i}`, organizationId: "org-a", leaseId: i === 0 ? "b" : "a", type: "renewal", scheduledOn: "2026-10-01" });
  }
  const rows = await listRenewals(ctx);
  expect(rows).toHaveLength(105);
  expect(rows.find((r) => r.leaseId === "b")?.rentBefore).toBe(50000);
  expect(rows.filter((r) => r.leaseId === "a").every((r) => r.rentBefore === null)).toBe(true);
});
