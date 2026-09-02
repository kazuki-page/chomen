import { fileURLToPath } from "node:url";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// アプリ用の vite.config.ts には Cloudflare Workers のビルド設定があるため、
// Node.js 上の純粋関数テストと Workers 上の D1 テストを別プロジェクトにする。
export default defineConfig(async () => {
  const appPath = fileURLToPath(new URL("./app", import.meta.url));
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("./database/migrations", import.meta.url)),
  );

  return {
    resolve: {
      alias: {
        "~": appPath,
      },
    },
    test: {
      projects: [
        {
          test: {
            name: "unit",
            include: ["app/**/*.test.ts"],
          },
        },
        {
          resolve: {
            alias: { "~": appPath },
          },
          plugins: [
            cloudflareTest({
              miniflare: {
                compatibilityDate: "2026-08-01",
                compatibilityFlags: ["nodejs_compat"],
                d1Databases: ["DB"],
                bindings: { TEST_MIGRATIONS: migrations },
              },
            }),
          ],
          test: {
            name: "workers",
            include: ["database/**/*.test.ts"],
          },
        },
      ],
    },
  };
});
