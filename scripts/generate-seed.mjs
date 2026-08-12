/**
 * シードデータを SQL ファイルとして書き出す。中身は database/seed.ts。
 *
 *   node scripts/generate-seed.mjs > database/seed.generated.sql
 *
 * `wrangler d1 execute --file` はトランザクションを張らないため、
 * ここでだけ外部キーの遅延評価を付ける（db.batch() 経由では不要）。
 *
 * Node の型ストリップを使って .ts をそのまま読み込むので Node 22.18 以上が要る。
 */
import { buildSeedStatements } from "../database/seed.ts";

// --now を付けると今日を基準にする。デモへ最初に流すときに使う
// （それ以降は日次リセットが実行時の日付で入れ直す）。
const today = process.argv.includes("--now") ? new Date() : undefined;

const statements = ["PRAGMA defer_foreign_keys = true;", ...buildSeedStatements({ today })];

process.stdout.write(statements.join("\n") + "\n");
