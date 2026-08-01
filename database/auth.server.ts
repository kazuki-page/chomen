import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDatabase } from "./context.server";
import * as schema from "./schema";

/**
 * 認証（Better Auth）。
 *
 * **一般公開のサインアップは行わない。** ユーザーは管理者が発行した招待リンク
 * 経由でのみ増える（要件定義 7.3）。サインアップ自体は Better Auth の
 * email + password を使い、招待トークンの検証は `services/invitations.server.ts` で行う。
 *
 * メール送信サービスに依存しないよう、メール確認は当面無効にしている。
 * 実利用者が3名で、招待リンクを直接渡す運用のため、これで足りる。
 * マジックリンクに切り替える場合はメール配信サービス（Resend など）の準備が必要。
 *
 * D1 のバインディングはリクエストごとにしか得られないため、
 * auth インスタンスも都度生成する。
 */
export function createAuth(d1: D1Database, options: { baseURL: string; secret: string }) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(createDatabase(d1), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    session: {
      // 親が毎回ログインし直すことがないよう長めに保つ
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
