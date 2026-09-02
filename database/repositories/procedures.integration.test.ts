import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createOrgContext } from "../context.server";
import {
  buildings,
  leases,
  organizations,
  procedureItems,
  procedures,
  rentRevisions,
  tenants,
  units,
} from "../schema";
import {
  cancelMoveOut,
  setItemChecked,
  startProcedure,
} from "../services/procedures.server";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("手続きの状態遷移", () => {
  it("入居完了で契約を有効化し、募集を消して2年後の更新を作る", async () => {
    const ctx = createOrgContext(env.DB, ORG_A);
    await seedLease({ organizationId: ORG_A, leaseId: "old-lease", status: "active" });
    await seedLease({ organizationId: ORG_A, leaseId: "new-lease", status: "pending" });

    const procedureId = await startProcedure(ctx, {
      leaseId: "new-lease",
      type: "move_in",
      scheduledOn: "2026-09-01",
    });
    await checkAllItems(ctx, procedureId);

    const [lease] = await ctx.db
      .select()
      .from(leases)
      .where(eq(leases.id, "new-lease"));
    const [oldLease] = await ctx.db
      .select()
      .from(leases)
      .where(eq(leases.id, "old-lease"));
    const [unit] = await ctx.db.select().from(units).where(eq(units.id, "unit-org-a"));
    const renewals = await ctx.db
      .select()
      .from(procedures)
      .where(and(eq(procedures.leaseId, "new-lease"), eq(procedures.type, "renewal")));

    expect(lease).toMatchObject({ status: "active", nextRenewalDate: "2028-01-31" });
    expect(oldLease).toMatchObject({ status: "ended", endedOn: "2026-01-31" });
    expect(unit).toMatchObject({ listingRent: null, listingStartedOn: null });
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ status: "todo", scheduledOn: "2028-01-31" });
  });

  it("退居完了で契約を終了し、次回更新日を消す", async () => {
    const ctx = createOrgContext(env.DB, ORG_A);
    await seedLease({ organizationId: ORG_A, leaseId: "lease-a", status: "active" });
    const procedureId = await startProcedure(ctx, {
      leaseId: "lease-a",
      type: "move_out",
      scheduledOn: "2027-03-31",
    });

    await checkAllItems(ctx, procedureId);

    const [lease] = await ctx.db.select().from(leases).where(eq(leases.id, "lease-a"));
    const [procedure] = await ctx.db
      .select()
      .from(procedures)
      .where(eq(procedures.id, procedureId));
    expect(lease).toMatchObject({
      status: "ended",
      endedOn: "2027-03-31",
      nextRenewalDate: null,
    });
    expect(procedure.status).toBe("done");
  });

  it("更新完了で予定家賃を確定し、次回更新日と次の手続きを作る", async () => {
    const ctx = createOrgContext(env.DB, ORG_A);
    await seedLease({ organizationId: ORG_A, leaseId: "lease-a", status: "active" });
    const procedureId = await startProcedure(ctx, {
      leaseId: "lease-a",
      type: "renewal",
      scheduledOn: "2028-01-31",
    });
    const items = await loadItems(ctx, procedureId);

    for (const item of items) {
      await setItemChecked(ctx, {
        procedureId,
        itemId: item.id,
        checked: true,
        newRent: item.key === "notice_decided" ? 105_000 : undefined,
      });
    }

    const [lease] = await ctx.db.select().from(leases).where(eq(leases.id, "lease-a"));
    const revisions = await ctx.db
      .select()
      .from(rentRevisions)
      .where(eq(rentRevisions.procedureId, procedureId));
    const nextRenewals = await ctx.db
      .select()
      .from(procedures)
      .where(
        and(
          eq(procedures.leaseId, "lease-a"),
          eq(procedures.type, "renewal"),
          eq(procedures.status, "todo"),
        ),
      );

    expect(lease.nextRenewalDate).toBe("2030-01-31");
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ amount: 105_000, confirmed: true });
    expect(nextRenewals).toHaveLength(1);
    expect(nextRenewals[0].scheduledOn).toBe("2030-01-31");
  });

  it("退居開始で未完了の更新を消し、取消時に白紙の更新を作り直す", async () => {
    const ctx = createOrgContext(env.DB, ORG_A);
    await seedLease({ organizationId: ORG_A, leaseId: "lease-a", status: "active" });
    const renewalId = await startProcedure(ctx, {
      leaseId: "lease-a",
      type: "renewal",
      scheduledOn: "2028-01-31",
    });
    const [notice] = await loadItems(ctx, renewalId);
    await setItemChecked(ctx, {
      procedureId: renewalId,
      itemId: notice.id,
      checked: true,
      newRent: 105_000,
    });

    const moveOutId = await startProcedure(ctx, {
      leaseId: "lease-a",
      type: "move_out",
      scheduledOn: "2027-03-31",
    });

    expect(await procedureCount(ctx, renewalId)).toBe(0);
    expect(await revisionCount(ctx, renewalId)).toBe(0);

    await cancelMoveOut(ctx, moveOutId);
    const replacements = await ctx.db
      .select()
      .from(procedures)
      .where(and(eq(procedures.leaseId, "lease-a"), eq(procedures.type, "renewal")));

    expect(await procedureCount(ctx, moveOutId)).toBe(0);
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({ status: "todo", scheduledOn: "2028-01-31" });
  });
});

describe("組織境界", () => {
  it("別組織の契約には手続きを作れない", async () => {
    const ctxA = createOrgContext(env.DB, ORG_A);
    await seedLease({ organizationId: ORG_A, leaseId: "lease-a", status: "active" });
    await seedLease({ organizationId: ORG_B, leaseId: "lease-b", status: "active" });

    await expect(
      startProcedure(ctxA, {
        leaseId: "lease-b",
        type: "move_out",
        scheduledOn: "2027-03-31",
      }),
    ).rejects.toThrow("契約が見つかりません");

    const foreignProcedures = await ctxA.db
      .select()
      .from(procedures)
      .where(and(eq(procedures.organizationId, ORG_A), eq(procedures.leaseId, "lease-b")));
    expect(foreignProcedures).toHaveLength(0);
  });
});

async function seedLease(input: {
  organizationId: string;
  leaseId: string;
  status: "pending" | "active";
}) {
  const ctx = createOrgContext(env.DB, input.organizationId);
  const suffix = input.organizationId;
  await ctx.db
    .insert(organizations)
    .values({ id: input.organizationId, name: `架空組織${suffix}` })
    .onConflictDoNothing();
  await ctx.db
    .insert(buildings)
    .values({
      id: `building-${suffix}`,
      organizationId: input.organizationId,
      name: `架空マンション${suffix}`,
    })
    .onConflictDoNothing();
  await ctx.db
    .insert(units)
    .values({
      id: `unit-${suffix}`,
      organizationId: input.organizationId,
      buildingId: `building-${suffix}`,
      type: "room",
      code: "101",
      listingRent: 100_000,
      listingStartedOn: "2026-08-01",
    })
    .onConflictDoNothing();
  await ctx.db.insert(tenants).values({
    id: `tenant-${input.leaseId}`,
    organizationId: input.organizationId,
    name: `架空入居者${input.leaseId}`,
    birthYear: 1970,
  });
  await ctx.db.insert(leases).values({
    id: input.leaseId,
    organizationId: input.organizationId,
    unitId: `unit-${suffix}`,
    tenantId: `tenant-${input.leaseId}`,
    contractDate: "2026-01-31",
    nextRenewalDate: "2028-01-31",
    status: input.status,
  });
}

async function loadItems(ctx: ReturnType<typeof createOrgContext>, procedureId: string) {
  return ctx.db
    .select({ id: procedureItems.id, key: procedureItems.key })
    .from(procedureItems)
    .where(eq(procedureItems.procedureId, procedureId))
    .orderBy(asc(procedureItems.sortOrder));
}

async function checkAllItems(ctx: ReturnType<typeof createOrgContext>, procedureId: string) {
  for (const item of await loadItems(ctx, procedureId)) {
    await setItemChecked(ctx, { procedureId, itemId: item.id, checked: true });
  }
}

async function procedureCount(ctx: ReturnType<typeof createOrgContext>, procedureId: string) {
  return (await ctx.db.select().from(procedures).where(eq(procedures.id, procedureId))).length;
}

async function revisionCount(ctx: ReturnType<typeof createOrgContext>, procedureId: string) {
  return (
    await ctx.db.select().from(rentRevisions).where(eq(rentRevisions.procedureId, procedureId))
  ).length;
}
