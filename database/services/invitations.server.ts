import { and, eq, isNull } from "drizzle-orm";

import type { Database, OrgContext } from "../context.server";
import type { Role } from "../repositories/memberships.server";
import { findFirstOrganization, hasNoUsers } from "../repositories/memberships.server";
import { invitations, memberships, organizations } from "../schema";

const INVITATION_TTL_DAYS = 14;

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: Date;
};

/** 招待を発行する。管理者のみ */
export async function createInvitation(
  ctx: OrgContext,
  input: { email: string; role: Role; invitedBy: string },
): Promise<string> {
  const token = crypto.randomUUID().replaceAll("-", "");
  await ctx.db.insert(invitations).values({
    organizationId: ctx.organizationId,
    email: input.email,
    role: input.role,
    token,
    expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
    invitedBy: input.invitedBy,
  });
  return token;
}

/** 未使用の招待一覧 */
export async function listPendingInvitations(ctx: OrgContext): Promise<PendingInvitation[]> {
  return ctx.db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, ctx.organizationId),
        isNull(invitations.acceptedAt),
      ),
    );
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string): Promise<void> {
  await ctx.db
    .delete(invitations)
    .where(
      and(
        eq(invitations.organizationId, ctx.organizationId),
        eq(invitations.id, invitationId),
      ),
    );
}

export type InvitationCheck =
  | { kind: "invited"; organizationId: string; role: Role; email: string; invitationId: string }
  | { kind: "bootstrap" }
  | { kind: "invalid"; reason: string };

/**
 * サインアップ可否を判定する。
 *
 * 一般公開のサインアップは行わないため、次のどちらかでなければ登録させない。
 *   1. 有効な招待トークンを持っている
 *   2. まだ誰も登録していない（初回セットアップ）
 */
export async function checkSignupEligibility(
  db: Database,
  token: string | null,
): Promise<InvitationCheck> {
  if (!token) {
    return (await hasNoUsers(db))
      ? { kind: "bootstrap" }
      : { kind: "invalid", reason: "登録には招待リンクが必要です" };
  }

  const [row] = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      role: invitations.role,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .where(eq(invitations.token, token));

  if (!row) return { kind: "invalid", reason: "招待リンクが見つかりません" };
  if (row.acceptedAt) return { kind: "invalid", reason: "この招待リンクは使用済みです" };
  if (row.expiresAt.getTime() < Date.now()) {
    return { kind: "invalid", reason: "招待リンクの有効期限が切れています" };
  }

  return {
    kind: "invited",
    organizationId: row.organizationId,
    role: row.role,
    email: row.email,
    invitationId: row.id,
  };
}

/**
 * サインアップ済みのユーザーを組織に所属させる。
 *
 * 初回セットアップの場合は、既存の組織（シードのデモ組織）に管理者として参加する。
 * 組織が1つも無ければ新規に作る。
 */
export async function attachUserToOrganization(
  db: Database,
  userId: string,
  check: InvitationCheck,
): Promise<void> {
  if (check.kind === "invited") {
    await db.insert(memberships).values({
      organizationId: check.organizationId,
      userId,
      role: check.role,
    });
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, check.invitationId));
    return;
  }

  if (check.kind !== "bootstrap") return;

  let organizationId = (await findFirstOrganization(db))?.id;
  if (!organizationId) {
    organizationId = crypto.randomUUID();
    await db.insert(organizations).values({ id: organizationId, name: "マイ物件" });
  }

  await db.insert(memberships).values({ organizationId, userId, role: "admin" });
}
