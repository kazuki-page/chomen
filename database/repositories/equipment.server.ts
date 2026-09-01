import { and, asc, desc, eq, sql } from "drizzle-orm";

import { EQUIPMENT_CATEGORIES, matrixKey, type EquipmentCategory } from "~/lib/constants";
import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { equipmentRecords, units } from "../schema";

export type EquipmentRecord = {
  id: string;
  unitId: string;
  unitCode: string;
  category: EquipmentCategory;
  performedOn: IsoDate;
  maker: string | null;
  modelNumber: string | null;
  cost: number | null;
  note: string | null;
};

export type EquipmentInput = {
  unitId: string;
  category: EquipmentCategory;
  performedOn: IsoDate;
  maker: string | null;
  modelNumber: string | null;
  cost: number | null;
  note: string | null;
};

/** 部屋 × 種別のマトリクス。各セルは最新の1件 */
export type EquipmentMatrix = {
  units: { id: string; code: string }[];
  /** `${unitId}:${category}` → 最新レコード */
  latest: Map<string, EquipmentRecord>;
};

/**
 * 「現在」を導出する。
 *
 * 現在の状態はどこにも保存していない。
 * 各（部屋 × 種別）で performed_on が最新のレコードが「前回やったこと」であり、
 * それがそのまま「今の状態」になる。
 */
export async function getEquipmentMatrix(ctx: OrgContext): Promise<EquipmentMatrix> {
  const unitRows = await ctx.db
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(and(eq(units.organizationId, ctx.organizationId), eq(units.type, "room")))
    .orderBy(asc(units.displayOrder), asc(units.code));

  // 各（部屋 × 種別）の最新1件だけを取り出す
  const rows = await ctx.db
    .select({
      id: equipmentRecords.id,
      unitId: equipmentRecords.unitId,
      unitCode: units.code,
      category: equipmentRecords.category,
      performedOn: equipmentRecords.performedOn,
      maker: equipmentRecords.maker,
      modelNumber: equipmentRecords.modelNumber,
      cost: equipmentRecords.cost,
      note: equipmentRecords.note,
    })
    .from(equipmentRecords)
    .innerJoin(
      units,
      and(
        eq(units.id, equipmentRecords.unitId),
        eq(units.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(equipmentRecords.organizationId, ctx.organizationId),
        sql`${equipmentRecords.performedOn} = (
          select max(e2.performed_on) from equipment_records e2
          where e2.unit_id = ${equipmentRecords.unitId}
            and e2.organization_id = ${ctx.organizationId}
            and e2.category = ${equipmentRecords.category}
        )`,
      ),
    );

  const latest = new Map<string, EquipmentRecord>();
  for (const row of rows) {
    latest.set(matrixKey(row.unitId, row.category), row);
  }

  return { units: unitRows, latest };
}

/** 特定の部屋の記録（履歴を含む） */
export async function listEquipmentForUnit(
  ctx: OrgContext,
  unitId: string,
): Promise<EquipmentRecord[]> {
  return ctx.db
    .select({
      id: equipmentRecords.id,
      unitId: equipmentRecords.unitId,
      unitCode: units.code,
      category: equipmentRecords.category,
      performedOn: equipmentRecords.performedOn,
      maker: equipmentRecords.maker,
      modelNumber: equipmentRecords.modelNumber,
      cost: equipmentRecords.cost,
      note: equipmentRecords.note,
    })
    .from(equipmentRecords)
    .innerJoin(
      units,
      and(
        eq(units.id, equipmentRecords.unitId),
        eq(units.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(equipmentRecords.organizationId, ctx.organizationId),
        eq(equipmentRecords.unitId, unitId),
      ),
    )
    .orderBy(desc(equipmentRecords.performedOn));
}

export async function getEquipmentRecord(
  ctx: OrgContext,
  recordId: string,
): Promise<EquipmentRecord | null> {
  const [row] = await ctx.db
    .select({
      id: equipmentRecords.id,
      unitId: equipmentRecords.unitId,
      unitCode: units.code,
      category: equipmentRecords.category,
      performedOn: equipmentRecords.performedOn,
      maker: equipmentRecords.maker,
      modelNumber: equipmentRecords.modelNumber,
      cost: equipmentRecords.cost,
      note: equipmentRecords.note,
    })
    .from(equipmentRecords)
    .innerJoin(
      units,
      and(
        eq(units.id, equipmentRecords.unitId),
        eq(units.organizationId, ctx.organizationId),
      ),
    )
    .where(
      and(
        eq(equipmentRecords.organizationId, ctx.organizationId),
        eq(equipmentRecords.id, recordId),
      ),
    );
  return row ?? null;
}

export async function createEquipmentRecord(
  ctx: OrgContext,
  input: EquipmentInput,
): Promise<string> {
  await requireEquipmentUnit(ctx, input.unitId);

  const id = crypto.randomUUID();
  await ctx.db
    .insert(equipmentRecords)
    .values({ id, organizationId: ctx.organizationId, ...normalize(input) });
  return id;
}

export async function updateEquipmentRecord(
  ctx: OrgContext,
  recordId: string,
  input: EquipmentInput,
  updatedAt: Date,
): Promise<void> {
  await requireEquipmentUnit(ctx, input.unitId);

  const updated = await ctx.db
    .update(equipmentRecords)
    .set({ ...normalize(input), updatedAt })
    .where(
      and(
        eq(equipmentRecords.organizationId, ctx.organizationId),
        eq(equipmentRecords.id, recordId),
      ),
    )
    .returning({ id: equipmentRecords.id });

  if (updated.length !== 1) {
    throw new Response("設備の記録が見つかりません", { status: 404 });
  }
}

export async function deleteEquipmentRecord(
  ctx: OrgContext,
  recordId: string,
): Promise<void> {
  await ctx.db
    .delete(equipmentRecords)
    .where(
      and(
        eq(equipmentRecords.organizationId, ctx.organizationId),
        eq(equipmentRecords.id, recordId),
      ),
    );
}

/** 型番を持たない種別（排水管洗浄など）では型番・メーカーを保存しない */
function normalize(input: EquipmentInput) {
  const hasModel = EQUIPMENT_CATEGORIES.find((c) => c.value === input.category)?.hasModel ?? true;
  return {
    unitId: input.unitId,
    category: input.category,
    performedOn: input.performedOn,
    maker: hasModel ? input.maker : null,
    modelNumber: hasModel ? input.modelNumber : null,
    cost: input.cost,
    note: input.note,
  };
}

/** POSTされた unitId を信用せず、現在の組織の部屋であることを確認する。 */
async function requireEquipmentUnit(ctx: OrgContext, unitId: string): Promise<void> {
  const [unit] = await ctx.db
    .select({ id: units.id })
    .from(units)
    .where(
      and(
        eq(units.organizationId, ctx.organizationId),
        eq(units.id, unitId),
        eq(units.type, "room"),
      ),
    );

  if (!unit) {
    throw new Response("部屋が見つかりません", { status: 404 });
  }
}
