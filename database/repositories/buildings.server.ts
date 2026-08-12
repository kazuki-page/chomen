import { and, asc, eq } from "drizzle-orm";

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
      /**
       * 生の sql`` で相関副問い合わせを書かないこと。
       *
       * 結合の無いクエリでは Drizzle が `${buildings.id}` をテーブル名なしの
       * `"id"` として出力する。副問い合わせの中では内側のテーブルが先に
       * 解決されるため `units.id` との比較になり、常に0件になっていた。
       * $count なら Drizzle が `"buildings"."id"` まで修飾してくれる。
       */
      unitCount: ctx.db.$count(
        units,
        and(eq(units.buildingId, buildings.id), eq(units.organizationId, ctx.organizationId)),
      ),
    })
    .from(buildings)
    .where(eq(buildings.organizationId, ctx.organizationId))
    .orderBy(asc(buildings.createdAt));
}

export async function getBuilding(
  ctx: OrgContext,
  buildingId: string,
): Promise<{ id: string; name: string; address: string | null } | null> {
  const [row] = await ctx.db
    .select({ id: buildings.id, name: buildings.name, address: buildings.address })
    .from(buildings)
    .where(
      and(eq(buildings.organizationId, ctx.organizationId), eq(buildings.id, buildingId)),
    );
  return row ?? null;
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
