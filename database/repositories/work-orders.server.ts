import { and, asc, desc, eq, like, ne, sql } from "drizzle-orm";

import {
  HANDLER_LABELS,
  STALE_THRESHOLD_DAYS,
  type Handler,
  type WorkOrderStatus,
} from "~/lib/constants";
import type { IsoDate } from "~/lib/date";
import type { OrgContext } from "../context.server";
import { units, workOrders } from "../schema";

export type WorkOrderListItem = {
  id: string;
  title: string;
  status: WorkOrderStatus;
  unitId: string | null;
  unitCode: string | null;
  locationNote: string | null;
  handler: Handler | null;
  handlerLabel: string;
  waitingOn: string | null;
  occurredOn: IsoDate;
  updatedAt: Date;
  /** 一定期間動きが無い案件。ホーム画面と一覧で強調する */
  isStale: boolean;
  staleDays: number;
};

export type WorkOrderDetail = WorkOrderListItem & {
  description: string | null;
  cost: number | null;
  paid: boolean;
  completedOn: IsoDate | null;
};

export type WorkOrderInput = {
  unitId: string | null;
  locationNote: string | null;
  title: string;
  description: string | null;
  occurredOn: IsoDate;
  handler: Handler | null;
  waitingOn: string | null;
  status: WorkOrderStatus;
  cost: number | null;
  paid: boolean;
};

/**
 * 未完了の修繕案件。ホーム画面の「やること」に使う。
 *
 * 修繕で最も困るのは記録の不足ではなく「忘れること」なので、
 * 一定期間動きの無い案件を検出できるようにしている。
 */
export async function listOpenWorkOrders(
  ctx: OrgContext,
  { now }: { now: Date },
): Promise<WorkOrderListItem[]> {
  const rows = await selectList(ctx)
    .where(and(eq(workOrders.organizationId, ctx.organizationId), ne(workOrders.status, "done")))
    .orderBy(asc(workOrders.updatedAt));

  return rows.map((r) => toListItem(r, now));
}

/**
 * 修繕一覧。status / unitId / year を省略すると絞り込まない。
 * year は発生日の暦年（1月〜12月）で絞る。
 */
export async function listWorkOrders(
  ctx: OrgContext,
  {
    now,
    status,
    unitId,
    year,
  }: { now: Date; status?: WorkOrderStatus; unitId?: string; year?: number },
): Promise<WorkOrderListItem[]> {
  const rows = await selectList(ctx)
    .where(
      and(
        eq(workOrders.organizationId, ctx.organizationId),
        status ? eq(workOrders.status, status) : undefined,
        unitId ? eq(workOrders.unitId, unitId) : undefined,
        year ? like(workOrders.occurredOn, `${year}-%`) : undefined,
      ),
    )
    .orderBy(desc(workOrders.occurredOn));

  return rows.map((r) => toListItem(r, now));
}

/** 絞り込みの選択肢に使う、記録が存在する年の一覧（新しい順） */
export async function listWorkOrderYears(ctx: OrgContext): Promise<number[]> {
  const rows = await ctx.db
    .selectDistinct({ year: sql<string>`substr(${workOrders.occurredOn}, 1, 4)` })
    .from(workOrders)
    .where(eq(workOrders.organizationId, ctx.organizationId));

  return rows
    .map((r) => Number(r.year))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
}

export async function getWorkOrder(
  ctx: OrgContext,
  workOrderId: string,
  { now }: { now: Date },
): Promise<WorkOrderDetail | null> {
  const [row] = await ctx.db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      description: workOrders.description,
      status: workOrders.status,
      unitId: workOrders.unitId,
      locationNote: workOrders.locationNote,
      handler: workOrders.handler,
      waitingOn: workOrders.waitingOn,
      occurredOn: workOrders.occurredOn,
      updatedAt: workOrders.updatedAt,
      cost: workOrders.cost,
      paid: workOrders.paid,
      completedOn: workOrders.completedOn,
      unitCode: units.code,
    })
    .from(workOrders)
    .leftJoin(units, eq(units.id, workOrders.unitId))
    .where(and(eq(workOrders.organizationId, ctx.organizationId), eq(workOrders.id, workOrderId)));

  if (!row) return null;

  return {
    ...toListItem(row, now),
    description: row.description,
    cost: row.cost,
    paid: row.paid,
    completedOn: row.completedOn,
  };
}

export async function createWorkOrder(
  ctx: OrgContext,
  input: WorkOrderInput,
): Promise<string> {
  const id = crypto.randomUUID();
  await ctx.db.insert(workOrders).values({
    id,
    organizationId: ctx.organizationId,
    ...normalize(input),
  });
  return id;
}

export async function updateWorkOrder(
  ctx: OrgContext,
  workOrderId: string,
  input: WorkOrderInput,
): Promise<void> {
  await ctx.db
    .update(workOrders)
    .set({ ...normalize(input), updatedAt: new Date() })
    .where(and(eq(workOrders.organizationId, ctx.organizationId), eq(workOrders.id, workOrderId)));
}

/** 完了日はステータスから導く。人に二度入力させない */
function normalize(input: WorkOrderInput) {
  return {
    unitId: input.unitId,
    locationNote: input.locationNote,
    title: input.title,
    description: input.description,
    occurredOn: input.occurredOn,
    handler: input.handler,
    // 完了した案件に「誰待ち」は残らない
    waitingOn: input.status === "done" ? null : input.waitingOn,
    status: input.status,
    cost: input.cost,
    paid: input.paid,
    completedOn: input.status === "done" ? (input.occurredOn ?? null) : null,
  };
}

function selectList(ctx: OrgContext) {
  return ctx.db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      status: workOrders.status,
      unitId: workOrders.unitId,
      locationNote: workOrders.locationNote,
      handler: workOrders.handler,
      waitingOn: workOrders.waitingOn,
      occurredOn: workOrders.occurredOn,
      updatedAt: workOrders.updatedAt,
      unitCode: units.code,
    })
    .from(workOrders)
    .leftJoin(units, eq(units.id, workOrders.unitId));
}

type ListRow = {
  id: string;
  title: string;
  status: WorkOrderStatus;
  unitId: string | null;
  unitCode: string | null;
  locationNote: string | null;
  handler: Handler | null;
  waitingOn: string | null;
  occurredOn: IsoDate;
  updatedAt: Date;
};

function toListItem(row: ListRow, now: Date): WorkOrderListItem {
  const staleDays = Math.floor((now.getTime() - row.updatedAt.getTime()) / 86_400_000);
  const isStale = row.status !== "done" && staleDays >= STALE_THRESHOLD_DAYS;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    unitId: row.unitId,
    unitCode: row.unitCode,
    locationNote: row.locationNote,
    handler: row.handler,
    handlerLabel: row.handler ? HANDLER_LABELS[row.handler] : "未定",
    waitingOn: row.waitingOn,
    occurredOn: row.occurredOn,
    updatedAt: row.updatedAt,
    staleDays,
    isStale,
  };
}
