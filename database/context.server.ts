import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(d1: D1Database) {
  return drizzle(d1, { schema });
}

/**
 * 組織スコープ付きのアクセスコンテキスト。
 *
 * D1 には Row Level Security が無いため、テナント分離はアプリケーション層で担保する。
 * その唯一の安全装置が `database/repositories/` 配下のリポジトリ関数であり、
 * **生の Drizzle クエリをこのディレクトリの外に書いてはならない**。
 *
 * すべてのリポジトリ関数は第1引数に OrgContext を取り、
 * すべてのクエリに organization_id 条件を含めること。
 *
 * @see docs/data-model.md 0.1
 */
export type OrgContext = {
  db: Database;
  organizationId: string;
};

export function createOrgContext(d1: D1Database, organizationId: string): OrgContext {
  return { db: createDatabase(d1), organizationId };
}
