import { defineConfig } from "vitest/config";

// アプリ用の vite.config.ts には Cloudflare Workers のビルド設定があるため、
// Node.js 上で実行する純粋関数のテストとは設定を分離する。
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "database/**/*.test.ts"],
  },
});
