import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, max } from "drizzle-orm";

import { MAX_UNITS_PER_BATCH } from "~/lib/unit-codes";
import type { OrgContext } from "../context.server";
import { leases, units } from "../schema";

export type CreateUnitsResult = {
  created: number;
  /** すでに同じ番号が存在してスキップしたもの */
  skipped: string[];
};

/**
 * 部屋・駐車場をまとめて登録する。
 *
 * 同じ建物に同じ番号がすでにあればスキップする（unique(building_id, code)）。
 * 途中で失敗して一部だけ登録される状態を避けるため、まとめて batch で流す。
 */
export async function createUnits(
  ctx: OrgContext,
  input: {
    buildingId: string;
    type: "room" | "parking";
    codes: string[];
    listingRent: number | null;
  },
): Promise<CreateUnitsResult> {
  const codes = input.codes.slice(0, MAX_UNITS_PER_BATCH);
  if (codes.length === 0) return { created: 0, skipped: [] };

  const existing = new Set(
    (
      await ctx.db
        .select({ code: units.code })
        .from(units)
        .where(
          and(
            eq(units.organizationId, ctx.organizationId),
            eq(units.buildingId, input.buildingId),
          ),
        )
    ).map((r) => r.code),
  );

  const [{ maxOrder } = { maxOrder: null }] = await ctx.db
    .select({ maxOrder: max(units.displayOrder) })
    .from(units)
    .where(
      and(eq(units.organizationId, ctx.organizationId), eq(units.buildingId, input.buildingId)),
    );

  let order = (maxOrder ?? -1) + 1;
  const skipped: string[] = [];
  const writes: BatchItem<"sqlite">[] = [];

  for (const code of codes) {
    if (existing.has(code)) {
      skipped.push(code);
      continue;
    }
    writes.push(
      ctx.db.insert(units).values({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        type: input.type,
        code,
        displayOrder: order++,
        // 登録直後は契約が無いため空室扱いになる。募集家賃を入れておくと一覧に出る
        listingRent: input.listingRent,
      }),
    );
  }

  if (writes.length > 0) {
    await ctx.db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  return { created: writes.length, skipped };
}

export type DeleteUnitResult = { ok: true } | { ok: false; reason: string };

/**
 * 部屋を削除する。登録時の打ち間違いを消すための機能。
 *
 * 契約の履歴がある部屋は削除させない。履歴ごと消えるのは事故なので、
 * FK の restrict に任せず事前に理由つきで拒否する。
 */
export async function deleteUnitIfUnused(
  ctx: OrgContext,
  unitId: string,
): Promise<DeleteUnitResult> {
  const [unit] = await ctx.db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)));

  if (!unit) return { ok: false, reason: "部屋が見つかりません" };

  const usedByLease = await ctx.db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.organizationId, ctx.organizationId), eq(leases.unitId, unitId)))
    .limit(1);

  if (usedByLease.length > 0) {
    return { ok: false, reason: "契約の履歴があるため削除できません" };
  }

  await ctx.db
    .delete(units)
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.id, unitId)));

  return { ok: true };
}
