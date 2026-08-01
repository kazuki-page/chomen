import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { dateOnly, primaryId, timestamps } from "./_shared";
import { leases } from "./leases";
import { organizations } from "./organizations";

/**
 * 手続き（入居 / 更新 / 退居）。本アプリの中核。
 *
 * 現行 Notion の「分類」に相当するが、ステータスの語彙は分類ごとに分けず統一する
 * （Notion では 進行中/完了/未/準備中/現在/過去 が混在し、意味が文脈依存になっていた）。
 *
 * 完了時には自動化ルールが走る。詳細は database/README または docs/data-model.md を参照。
 */
export const procedures = sqliteTable(
  "procedures",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: text("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["move_in", "renewal", "move_out"],
    }).notNull(),
    status: text("status", {
      enum: ["todo", "in_progress", "done"],
    })
      .notNull()
      .default("todo"),
    /** 入居日 / 更新予定日 / 退居日 */
    scheduledOn: dateOnly("scheduled_on"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("procedures_org_status_idx").on(t.organizationId, t.status),
    index("procedures_lease_idx").on(t.leaseId),
    index("procedures_scheduled_idx").on(t.scheduledOn),
  ],
);

/**
 * チェック項目。
 *
 * 手続き作成時に type に応じたテンプレートから自動生成する。
 * 項目の内容は現行の運用マニュアルの手順をそのまま写したもの（要件定義 4.3）。
 *
 * `valueText` は「更新通知内容の決定日」「支払いを確認した年月」など、
 * チェックに付随する入力を保持する。
 */
export const procedureItems = sqliteTable(
  "procedure_items",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    procedureId: text("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    /** テンプレート上のキー */
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }),
    valueText: text("value_text"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("procedure_items_org_idx").on(t.organizationId),
    index("procedure_items_procedure_idx").on(t.procedureId, t.sortOrder),
  ],
);
