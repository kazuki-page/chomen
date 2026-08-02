import { sql } from "drizzle-orm";

import type { Database } from "../context.server";

export type RateLimitResult = {
  allowed: boolean;
  /** 制限中の場合、解除までの秒数 */
  retryAfterSeconds: number;
};

/**
 * ログイン・登録の試行回数を制限する。
 *
 * ログイン画面は認証前に到達できるため、総当たりの入口になる。
 * Better Auth の rateLimit は HTTP ハンドラ経由の呼び出しにしか効かず、
 * 本アプリの loader / action は `auth.api.*` を直接呼ぶため素通りしてしまう。
 * そのため自前で持つ。
 *
 * 認証前に判定するので OrgContext ではなく素の Database を受け取る。
 * **この例外を業務クエリに広げないこと。**
 *
 * 増加と判定は 1 本の UPSERT で行い、同時アクセスでも取りこぼさないようにする。
 */
export async function consumeAttempt(
  db: Database,
  input: { key: string; max: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const expiresAt = now + input.windowSeconds * 1000;

  const rows = await db.all<{ count: number; expires_at: number }>(sql`
    insert into rate_limits (key, count, expires_at)
    values (${input.key}, 1, ${expiresAt})
    on conflict(key) do update set
      count      = case when rate_limits.expires_at < ${now} then 1 else rate_limits.count + 1 end,
      expires_at = case when rate_limits.expires_at < ${now} then ${expiresAt} else rate_limits.expires_at end
    returning count, expires_at
  `);

  const row = rows[0];
  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  if (row.count > input.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((row.expires_at - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** ログイン成功時など、カウントを取り消したいときに使う */
export async function resetAttempts(db: Database, key: string): Promise<void> {
  await db.run(sql`delete from rate_limits where key = ${key}`);
}

/** リクエスト元の識別子。Cloudflare が付与するヘッダを優先する */
export function clientKey(request: Request, suffix: string): string {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return `${ip}|${suffix}`;
}
