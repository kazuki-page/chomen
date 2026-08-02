import { and, asc, eq, sql } from "drizzle-orm";

import type { OrgContext } from "../context.server";
import { buildings, units } from "../schema";

export type BuildingListItem = {
  id: string;
  name: string;
  address: string | null;
  unitCount: number;
};

export async function listBuildings(ctx: OrgContext): Promise<BuildingListItem[]> {
  return ctx.db
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      unitCount: sql<number>`(
        select count(*) from units u where u.building_id = ${buildings.id}
      )`,
    })
    .from(buildings)
    .where(eq(buildings.organizationId, ctx.organizationId))
    .orderBy(asc(buildings.createdAt));
}

export async function createBuilding(
  ctx: OrgContext,
  input: { name: string; address: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  await ctx.db.insert(buildings).values({
    id,
    organizationId: ctx.organizationId,
    name: input.name,
    address: input.address,
  });
  return id;
}

export async function updateBuilding(
  ctx: OrgContext,
  buildingId: string,
  input: { name: string; address: string | null },
): Promise<void> {
  await ctx.db
    .update(buildings)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(eq(buildings.organizationId, ctx.organizationId), eq(buildings.id, buildingId)),
    );
}
