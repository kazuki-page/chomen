import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * ログイン・登録試行の回数制限。
 *
 * 認証の**前**に判定する必要があるため、業務テーブルと違い organization_id を持たない。
 * key には IP とメールアドレスから作った識別子が入る。
 *
 * @see database/services/rate-limit.server.ts
 */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  /** この時刻を過ぎたらカウントをリセットする */
  expiresAt: integer("expires_at").notNull(),
});
