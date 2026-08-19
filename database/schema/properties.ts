import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { dateOnly, primaryId, timestamps } from "./_shared";
import { organizations } from "./organizations";

/**
 * 建物。
 * 複数棟を前提とした構造にしておく。
 */
export const buildings = sqliteTable(
  "buildings",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 帳票に出力するため保持する */
    address: text("address"),
    ...timestamps,
  },
  (t) => [index("buildings_org_idx").on(t.organizationId)],
);

/**
 * 貸出単位（部屋・駐車場）。
 *
 * 部屋契約と駐車場契約は別契約として扱う。
 * 実態はセット契約が主だが、モデルを分けたほうが単純になる。
 *
 * 「空室」はレコードとして持たない。
 * 当該 Unit に status='active' の Lease が存在しなければ空室、として導出する。
 */
export const units = sqliteTable(
  "units",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buildingId: text("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["room", "parking"] }).notNull(),
    /** 部屋番号（101, 205）または駐車場番号（P1, P2）。体系は重複しない */
    code: text("code").notNull(),
    displayOrder: integer("display_order").notNull().default(0),

    /**
     * 募集家賃・募集開始日。空室時のみ意味を持つ。
     * 現行 Notion の「空室」レコードが持っていた情報の受け皿。
     */
    listingRent: integer("listing_rent"),
    listingStartedOn: dateOnly("listing_started_on"),

    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("units_building_code_unq").on(t.buildingId, t.code),
    index("units_org_idx").on(t.organizationId),
  ],
);
