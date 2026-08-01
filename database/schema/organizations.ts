import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { primaryId, timestamps } from "./_shared";

/**
 * 組織（物件オーナー単位）。
 * すべての業務データはこの単位で分離される。
 */
export const organizations = sqliteTable("organizations", {
  id: primaryId(),
  name: text("name").notNull(),
  ...timestamps,
});

/**
 * 所属とロール。
 *
 * 閲覧専用ロールは設けない（要件定義 2章）。
 * `userId` は Better Auth が管理する users テーブルを参照するが、
 * 認証未導入のため現時点では外部キー制約を張らない。
 */
export const memberships = sqliteTable(
  "memberships",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["admin", "editor"] }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_unq").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * 招待。
 *
 * 一般公開のサインアップは実装しないため、
 * 管理者が発行した招待リンク経由でのみユーザーが増える（要件定義 7.3）。
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "editor"] }).notNull(),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    invitedBy: text("invited_by").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_token_unq").on(t.token),
    index("invitations_org_idx").on(t.organizationId),
  ],
);
