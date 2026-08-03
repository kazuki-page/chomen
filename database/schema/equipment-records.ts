import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { dateOnly, primaryId, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { units } from "./properties";

/**
 * 設備の実施記録。
 *
 * 「現在どうなっているか」を状態として保存せず、**実施の履歴として積む**。
 * 現在＝各（部屋 × 種別）で performed_on が最新のレコード、として導出する。
 *
 * これは本アプリの他の箇所と同じ考え方:
 *   - 現在の家賃 … 家賃改定履歴の最新から導出
 *   - 空室      … 有効な契約が無いことから導出
 *
 * 上書き型にすると前々回の型番が消え、「何年で壊れているか」が分からなくなる。
 *
 * 突発的な不具合は形が定まらないため、このテーブルではなく work_orders（修繕）で扱う。
 * 両者は独立していて、どちらかに寄せる必要はない。
 */
export const equipmentRecords = sqliteTable(
  "equipment_records",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 部屋・駐車場に紐づく。共用部の設備は修繕タブで扱うため必須 */
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: [
        "water_heater",
        "air_conditioner",
        "ih_cooktop",
        "bath_fan",
        "kitchen_fan",
        "drain_cleaning",
        "other",
      ],
    }).notNull(),
    /** 交換日・実施日 */
    performedOn: dateOnly("performed_on").notNull(),
    maker: text("maker"),
    modelNumber: text("model_number"),
    /** 費用。基本はオーナー負担のため区分は持たず、例外はメモに書く */
    cost: integer("cost"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("equipment_records_org_idx").on(t.organizationId),
    // 「各部屋・各種別の最新」を引くための索引
    index("equipment_records_latest_idx").on(t.unitId, t.category, t.performedOn),
  ],
);
