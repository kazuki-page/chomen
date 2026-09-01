import { and, asc, eq } from "drizzle-orm";

import type { Database, OrgContext } from "../context.server";
import { memberships, organizations, user } from "../schema";

export type Role = "admin" | "editor";

/**
 * ユーザーが所属する組織を解決する。
 *
 * **組織スコープを持たない唯一のクエリ。**
 * ログインしたユーザーがどの組織に属するかを決める処理なので、
 * 原理的に organization_id で絞ることができない。
 * ここで解決した organizationId が、以降すべてのクエリのスコープになる。
 *
 * このため OrgContext ではなく素の Database を受け取る。
 * **この例外を他の関数に広げないこと。**
 */
export async function findMembershipForUser(
  db: Database,
  userId: string,
): Promise<{ organizationId: string; role: Role } | null> {
  const [row] = await db
    .select({ organizationId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));

  return row ?? null;
}

/** 組織のメンバー一覧 */
export async function listMembers(ctx: OrgContext): Promise<
  {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
  }[]
> {
  return ctx.db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      name: user.name,
      email: user.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.organizationId, ctx.organizationId))
    .orderBy(asc(memberships.createdAt));
}

/**
 * 組織の管理者の宛先。パスワード再発行の依頼を知らせるために使う。
 *
 * 認証前（ログインしていない相手からの依頼）に呼ばれるため、
 * OrgContext ではなく素の Database と組織 ID を受け取る。
 * **この例外を業務クエリに広げないこと。**
 */
export async function listAdminEmails(
  db: Database,
  organizationId: string,
): Promise<{ name: string; email: string }[]> {
  return db
    .select({ name: user.name, email: user.email })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "admin")))
    .orderBy(asc(memberships.createdAt));
}

/** 初回セットアップ判定に使う。まだ誰も登録していなければ true */
export async function hasNoUsers(db: Database): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length === 0;
}

/**
 * 初回登録で作られた user が、本当に唯一のユーザーかを確認する。
 *
 * サインアップ可否の事前確認後に別リクエストが user を作る競合を検出し、
 * 複数の初回管理者が生まれることを防ぐ。
 */
export async function isOnlyUser(db: Database, userId: string): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(2);
  return rows.length === 1 && rows[0]?.id === userId;
}

/** 初回セットアップ時に使う既存の組織。シードのデモ組織を想定 */
export async function findFirstOrganization(
  db: Database,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  return row ?? null;
}
