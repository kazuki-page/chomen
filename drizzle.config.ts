import { defineConfig } from "drizzle-kit";

/**
 * マイグレーション SQL の生成にのみ使用する。
 *
 * 生成した SQL の適用は wrangler 側で行う:
 *   npm run db:generate  … スキーマから SQL を生成
 *   npm run db:migrate   … ローカル D1 に適用
 *   npm run db:migrate:remote … 本番 D1 に適用
 *
 * このため drizzle-kit に Cloudflare の認証情報を渡す必要はない。
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./database/schema/index.ts",
  out: "./database/migrations",
});
