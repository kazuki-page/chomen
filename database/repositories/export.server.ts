import { asc, desc, eq, sql } from "drizzle-orm";

import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import {
  buildings,
  equipmentRecords,
  leases,
  procedures,
  rentRevisions,
  tenants,
  units,
  workOrders,
} from "../schema";

export type LeaseExportRow = {
  unitCode: string;
  unitType: "room" | "parking";
  tenantName: string;
  birthYear: number | null;
  contractDate: IsoDate;
  rent: number | null;
  nextRenewalDate: IsoDate | null;
  status: "active" | "ended";
  endedOn: IsoDate | null;
};

/**
 * 契約の書き出し。終了した契約も含む。
 *
 * 列の並びは一括登録（インポート）と同じにしてある。
 * 書き出して直して読み込み直す、という使い方ができる。
 * 「状態」「退去日」もインポート側が読み、終了した契約として登録される。
 */
export async function exportLeases(
  ctx: OrgContext,
  { asOf }: { asOf: IsoDate },
): Promise<LeaseExportRow[]> {
  const currentRent = sql<number | null>`(
    select r.amount from rent_revisions r
    where r.lease_id = ${leases.id} and r.confirmed = 1 and r.effective_from <= ${asOf}
    order by r.effective_from desc limit 1
  )`;

  return ctx.db
    .select({
      unitCode: units.code,
      unitType: units.type,
      tenantName: tenants.name,
      birthYear: tenants.birthYear,
      contractDate: leases.contractDate,
      rent: currentRent,
      nextRenewalDate: leases.nextRenewalDate,
      status: leases.status,
      endedOn: leases.endedOn,
    })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(leases.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), asc(leases.contractDate));
}

export type EquipmentExportRow = {
  unitCode: string;
  category: string;
  performedOn: IsoDate;
  maker: string | null;
  modelNumber: string | null;
  cost: number | null;
  note: string | null;
};

export async function exportEquipment(ctx: OrgContext): Promise<EquipmentExportRow[]> {
  return ctx.db
    .select({
      unitCode: units.code,
      category: equipmentRecords.category,
      performedOn: equipmentRecords.performedOn,
      maker: equipmentRecords.maker,
      modelNumber: equipmentRecords.modelNumber,
      cost: equipmentRecords.cost,
      note: equipmentRecords.note,
    })
    .from(equipmentRecords)
    .innerJoin(units, eq(units.id, equipmentRecords.unitId))
    .where(eq(equipmentRecords.organizationId, ctx.organizationId))
    .orderBy(asc(units.displayOrder), desc(equipmentRecords.performedOn));
}

export type WorkOrderExportRow = {
  unitCode: string | null;
  locationNote: string | null;
  title: string;
  description: string | null;
  occurredOn: IsoDate;
  handler: string | null;
  waitingOn: string | null;
  status: string;
  cost: number | null;
  paid: boolean;
  completedOn: IsoDate | null;
};

export async function exportWorkOrders(ctx: OrgContext): Promise<WorkOrderExportRow[]> {
  return ctx.db
    .select({
      unitCode: units.code,
      locationNote: workOrders.locationNote,
      title: workOrders.title,
      description: workOrders.description,
      occurredOn: workOrders.occurredOn,
      handler: workOrders.handler,
      waitingOn: workOrders.waitingOn,
      status: workOrders.status,
      cost: workOrders.cost,
      paid: workOrders.paid,
      completedOn: workOrders.completedOn,
    })
    .from(workOrders)
    .leftJoin(units, eq(units.id, workOrders.unitId))
    .where(eq(workOrders.organizationId, ctx.organizationId))
    .orderBy(desc(workOrders.occurredOn));
}

export type LedgerUnit = {
  id: string;
  code: string;
  type: "room" | "parking";
  isVacant: boolean;
  listingRent: number | null;
  tenantName: string | null;
  tenantBirthYear: number | null;
  contractDate: IsoDate | null;
  nextRenewalDate: IsoDate | null;
  rent: number | null;
  history: { tenantName: string; contractDate: IsoDate; endedOn: IsoDate | null }[];
  equipment: { category: string; performedOn: IsoDate; modelNumber: string | null }[];
  workOrders: { title: string; occurredOn: IsoDate; status: string; cost: number | null }[];
  procedures: { type: string; scheduledOn: IsoDate | null; status: string }[];
};

/**
 * 部屋台帳（1部屋1枚の印刷）に必要なデータをまとめて取る。
 *
 * 部屋ごとに問い合わせると40室で数百クエリになるため、
 * 種類ごとに1回ずつ引いて JS 側で部屋にぶら下げる。
 */
export async function getLedger(
  ctx: OrgContext,
  { asOf }: { asOf: IsoDate },
): Promise<LedgerUnit[]> {
  const currentRent = sql<number | null>`(
    select r.amount from rent_revisions r
    where r.lease_id = ${leases.id} and r.confirmed = 1 and r.effective_from <= ${asOf}
    order by r.effective_from desc limit 1
  )`;

  const [unitRows, leaseRows, equipmentRows, workOrderRows, procedureRows] = await Promise.all([
    ctx.db
      .select({
        id: units.id,
        code: units.code,
        type: units.type,
        listingRent: units.listingRent,
      })
      .from(units)
      .where(eq(units.organizationId, ctx.organizationId))
      .orderBy(asc(units.displayOrder), asc(units.code)),

    ctx.db
      .select({
        unitId: leases.unitId,
        tenantName: tenants.name,
        birthYear: tenants.birthYear,
        contractDate: leases.contractDate,
        nextRenewalDate: leases.nextRenewalDate,
        status: leases.status,
        endedOn: leases.endedOn,
        rent: currentRent,
      })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(eq(leases.organizationId, ctx.organizationId))
      .orderBy(desc(leases.contractDate)),

    ctx.db
      .select({
        unitId: equipmentRecords.unitId,
        category: equipmentRecords.category,
        performedOn: equipmentRecords.performedOn,
        modelNumber: equipmentRecords.modelNumber,
      })
      .from(equipmentRecords)
      .where(eq(equipmentRecords.organizationId, ctx.organizationId))
      .orderBy(desc(equipmentRecords.performedOn)),

    ctx.db
      .select({
        unitId: workOrders.unitId,
        title: workOrders.title,
        occurredOn: workOrders.occurredOn,
        status: workOrders.status,
        cost: workOrders.cost,
      })
      .from(workOrders)
      .where(eq(workOrders.organizationId, ctx.organizationId))
      .orderBy(desc(workOrders.occurredOn)),

    ctx.db
      .select({
        unitId: leases.unitId,
        type: procedures.type,
        scheduledOn: procedures.scheduledOn,
        status: procedures.status,
      })
      .from(procedures)
      .innerJoin(leases, eq(leases.id, procedures.leaseId))
      .where(eq(procedures.organizationId, ctx.organizationId))
      .orderBy(desc(procedures.scheduledOn)),
  ]);

  const group = <T extends { unitId: string | null }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.unitId) continue;
      const list = map.get(row.unitId) ?? [];
      list.push(row);
      map.set(row.unitId, list);
    }
    return map;
  };

  const leasesByUnit = group(leaseRows);
  const equipmentByUnit = group(equipmentRows);
  const workOrdersByUnit = group(workOrderRows);
  const proceduresByUnit = group(procedureRows);

  return unitRows.map((unit) => {
    const unitLeases = leasesByUnit.get(unit.id) ?? [];
    const active = unitLeases.find((l) => l.status === "active");

    return {
      id: unit.id,
      code: unit.code,
      type: unit.type,
      isVacant: !active,
      listingRent: unit.listingRent,
      tenantName: active?.tenantName ?? null,
      tenantBirthYear: active?.birthYear ?? null,
      contractDate: active?.contractDate ?? null,
      nextRenewalDate: active?.nextRenewalDate ?? null,
      rent: active?.rent ?? null,
      history: unitLeases.map((l) => ({
        tenantName: l.tenantName,
        contractDate: l.contractDate,
        endedOn: l.endedOn,
      })),
      equipment: equipmentByUnit.get(unit.id) ?? [],
      workOrders: workOrdersByUnit.get(unit.id) ?? [],
      procedures: proceduresByUnit.get(unit.id) ?? [],
    };
  });
}

/** 帳票の見出しに出す建物情報。複数棟なら最初の1件 */
export async function getPrimaryBuilding(
  ctx: OrgContext,
): Promise<{ name: string; address: string | null }> {
  const [row] = await ctx.db
    .select({ name: buildings.name, address: buildings.address })
    .from(buildings)
    .where(eq(buildings.organizationId, ctx.organizationId))
    .orderBy(asc(buildings.createdAt))
    .limit(1);
  return row ?? { name: "", address: null };
}
