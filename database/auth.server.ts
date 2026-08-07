import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDatabase } from "./context.server";
import * as schema from "./schema";
import {
  dispatchPasswordReset,
  RESET_TOKEN_TTL_SECONDS,
} from "./services/password-reset.server";

/**
 * 認証（Better Auth）。
 *
 * **一般公開のサインアップは行わない。** ユーザーは管理者が発行した招待リンク
 * 経由でのみ増える（要件定義 7.3）。サインアップ自体は Better Auth の
 * email + password を使い、招待トークンの検証は `services/invitations.server.ts` で行う。
 *
 * メール確認（登録時の確認メール）は無効のまま。招待リンクを直接渡す運用のため要らない。
 * 一方、パスワードの再発行だけはメールを使う。忘れたときの受け皿が他に無いため。
 *
 * D1 のバインディングはリクエストごとにしか得られないため、
 * auth インスタンスも都度生成する。
 */
export function createAuth(d1: D1Database, options: { baseURL: string; secret: string }) {
  const db = createDatabase(d1);

  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(db, {
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
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      // 再設定したら、他の端末に残っているログインを全部切る
      revokeSessionsOnPasswordReset: true,
      /**
       * **依頼者にそのまま送るとは限らない。**
       * 管理者なら本人に再設定リンク、それ以外なら管理者へ通知が飛ぶ。
       * 分岐は dispatchPasswordReset 側にあり、どちらでも応答は変わらない。
       *
       * Better Auth はこの時点でトークンを作り終えている。管理者以外の依頼では
       * 使われないまま失効するが、害はないのでそのままにしている。
       */
      sendResetPassword: async ({ user, token }) => {
        await dispatchPasswordReset(db, {
          userId: user.id,
          name: user.name,
          email: user.email,
          token,
          baseURL: options.baseURL,
        });
      },
    },
    session: {
      // 親が毎回ログインし直すことがないよう長めに保つ
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
