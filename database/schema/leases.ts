import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { dateOnly, primaryId, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { units } from "./properties";

/**
 * 入居者。
 *
 * 保持してよいのは氏名と生年（年のみ）だけ。
 * 連絡先・住所・勤務先などは管理会社が保持しており、本アプリで参照する必要がない。
 * GitHub 公開を前提とするため、保持する個人情報は最小限に留める。
 *
 * 同一人物が部屋と駐車場を借りる場合、複数の Lease から同一の Tenant を参照する。
 */
export const tenants = sqliteTable(
  "tenants",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 生年。月日は保持しない */
    birthYear: integer("birth_year"),
    ...timestamps,
  },
  (t) => [index("tenants_org_idx").on(t.organizationId)],
);

/**
 * 契約。
 *
 * 家賃はこのテーブルに持たせない（rentRevisions から導出する）。
 */
export const leases = sqliteTable(
  "leases",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    contractDate: dateOnly("contract_date").notNull(),
    /** 契約日の2年後の同日 */
    nextRenewalDate: dateOnly("next_renewal_date"),
    status: text("status", { enum: ["active", "ended"] })
      .notNull()
      .default("active"),
    endedOn: dateOnly("ended_on"),
    ...timestamps,
  },
  (t) => [
    index("leases_org_idx").on(t.organizationId),
    index("leases_unit_status_idx").on(t.unitId, t.status),
    index("leases_next_renewal_idx").on(t.nextRenewalDate),
  ],
);

/**
 * 家賃改定履歴。
 *
 * 「現在の家賃」は保存せず、effective_from <= 本日 かつ confirmed=1 のうち
 * 最新の amount として導出する。
 *
 * 更新手続きとの連動:
 *   1. 「更新通知内容の決定」で更新後家賃を確定 → confirmed=0（予定）で1件作成
 *   2. 「家賃変更後の金額での入金を確認」がチェックされた時点で confirmed=1
 *   3. 家賃据え置きの場合も同額で1件作成する（reason='renewal'）
 *      → 更新ごとに1件が対応し、履歴が途切れない
 */
export const rentRevisions = sqliteTable(
  "rent_revisions",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: text("lease_id")
      .notNull()
      .references(() => leases.id, { onDelete: "cascade" }),
    effectiveFrom: dateOnly("effective_from").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason", {
      enum: ["initial", "renewal", "adjustment"],
    }).notNull(),
    /** 生成元の手続き。手続き経由でない改定では null */
    procedureId: text("procedure_id"),
    /** 予定=false / 確定=true */
    confirmed: integer("confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    index("rent_revisions_org_idx").on(t.organizationId),
    index("rent_revisions_lease_idx").on(t.leaseId, t.effectiveFrom),
  ],
);
