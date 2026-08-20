/**
 * デモ環境の公開情報。
 *
 * ここに秘密は無い。デモのアカウントは README にも載せる使い捨ての資格情報で、
 * 中身は架空のデータしか入っていない（database/seed.ts）。
 *
 * サーバー・クライアントの両方から読むので `.server.ts` にはしない。
 * デモかどうかの判定そのものは環境変数 DEMO_MODE で、root の loader が配る。
 */

/** 実在しないことが保証されているドメイン（RFC 2606） */
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo1234";

/** リセットの時刻。cron は wrangler.jsonc の env.demo に書いてある */
export const DEMO_RESET_AT = "毎日 朝4時ごろ";

export const REPO_URL = "https://github.com/kazuki-page/chomen";

/**
 * OGP が指す先。**デモに固定する。**
 *
 * 共有されるのはデモの URL だけで、本番は家族用のため公開していない。
 * リクエストのオリジンから組み立てることもできるが、そのために
 * ルートごとの meta を触ると、各画面が持つ title の扱いが複雑になる。
 */
export const DEMO_ORIGIN = "https://chomen-demo.kazuki.page";
