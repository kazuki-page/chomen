import { integer, text } from "drizzle-orm/sqlite-core";

/**
 * 主キー。Workers 上で利用可能な crypto.randomUUID() を使う。
 */
export const primaryId = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * 全テーブル共通のタイムスタンプ。
 *
 * `updatedAt` は修繕案件の放置検知に使うため、必ず自動更新されるようにしておく。
 */
export const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

/**
 * 日付のみを保持するカラム。`YYYY-MM-DD` 形式の文字列で持つ。
 *
 * 契約日・更新予定日・入居日などは「時刻」を持たない概念であり、
 * タイムスタンプで持つとタイムゾーン起因で日付がずれる。
 * 特に「契約日の2年後の同日」を扱う本アプリでは致命的になるため、
 * 日付は文字列として素直に保持する（SQLite 上でそのまま比較・ソートできる）。
 */
export const dateOnly = (name: string) => text(name);
