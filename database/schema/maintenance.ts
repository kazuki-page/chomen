import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { dateOnly, primaryId, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { units } from "./properties";

/**
 * 修繕案件。
 *
 * 不具合連絡は管理会社経由で入り、その後
 * 「自分たちでやる / 業者に投げる / 管理会社に任せる」に分岐する。
 * この分岐後にボールの所在が不明になることが最大の課題であるため、
 * 工程を細分化せず handler（誰がやる）と waitingOn（今誰待ち）の2点に絞る。
 *
 * 放置の可視化を最重要機能とする:
 *   status != 'done' かつ updatedAt が14日以上前 → ホーム画面で強調
 *
 * 費用は金額と請求書写真のみ。紙の明細を転記する運用は続かないため記録項目を最小化する。
 */
export const workOrders = sqliteTable(
  "work_orders",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null = 共用部 */
    unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
    locationNote: text("location_note"),
    title: text("title").notNull(),
    description: text("description"),
    occurredOn: dateOnly("occurred_on").notNull(),

    /** 誰がやるか */
    handler: text("handler", {
      enum: ["self", "vendor", "management"],
    }),
    /** 今ボールを持っているのは誰か */
    waitingOn: text("waiting_on"),

    status: text("status", {
      enum: ["todo", "in_progress", "done"],
    })
      .notNull()
      .default("todo"),

    cost: integer("cost"),
    paid: integer("paid", { mode: "boolean" }).notNull().default(false),
    completedOn: dateOnly("completed_on"),
    ...timestamps,
  },
  (t) => [
    index("work_orders_org_status_idx").on(t.organizationId, t.status),
    index("work_orders_unit_idx").on(t.unitId),
    /** 放置検知用 */
    index("work_orders_updated_idx").on(t.updatedAt),
  ],
);

/**
 * 添付ファイル（R2 上のオブジェクトへの参照）。
 *
 * 用途: 修繕の before/after 写真、請求書の撮影、設備銘板の撮影。
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type", {
      enum: ["work_order", "equipment_record"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    r2Key: text("r2_key").notNull(),
    filename: text("filename"),
    contentType: text("content_type"),
    size: integer("size"),
    uploadedBy: text("uploaded_by"),
    ...timestamps,
  },
  (t) => [
    index("attachments_org_idx").on(t.organizationId),
    index("attachments_entity_idx").on(t.entityType, t.entityId),
  ],
);
