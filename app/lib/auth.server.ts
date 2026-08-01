import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { createAuth } from "@db/auth.server";
import { createDatabase, createOrgContext, type OrgContext } from "@db/context.server";
import { findMembershipForUser, type Role } from "@db/repositories/memberships.server";

export function getAuth(request: Request) {
  return createAuth(env.DB, {
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
  });
}

export type AppSession = {
  user: { id: string; name: string; email: string };
  organizationId: string;
  role: Role;
};

/** ログインしていなければ null。ログイン画面など、認証を要求しない場所で使う */
export async function getAppSession(request: Request): Promise<AppSession | null> {
  const session = await getAuth(request).api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const membership = await findMembershipForUser(createDatabase(env.DB), session.user.id);
  if (!membership) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

/**
 * 認証を要求する。
 *
 * **すべての業務画面の loader / action はこれを通す。**
 * 返される OrgContext のスコープは、ログインしたユーザーの所属組織で確定している。
 */
export async function requireOrg(
  request: Request,
): Promise<{ ctx: OrgContext; session: AppSession }> {
  const session = await getAppSession(request);
  if (!session) {
    const url = new URL(request.url);
    const next = url.pathname + url.search;
    throw redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return { ctx: createOrgContext(env.DB, session.organizationId), session };
}

/** 管理者のみ許可する操作に使う */
export async function requireAdmin(request: Request) {
  const result = await requireOrg(request);
  if (result.session.role !== "admin") {
    throw new Response("権限がありません", { status: 403 });
  }
  return result;
}

/** Better Auth のレスポンスから Set-Cookie を引き継ぐ */
export function cookieHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}
