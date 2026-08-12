import { buildSeedStatements } from "../seed";

/**
 * デモ環境のデータを初期状態へ戻す。
 *
 * **本番では絶対に呼ばないこと。** 呼び出し側（workers/app.ts の scheduled）で
 * DEMO_MODE を確認しており、cron の登録もデモ環境にしか無い。この関数自体は
 * 渡された D1 を無条件に書き換えるので、二重の歯止めを外さないこと。
 *
 * 消すのは業務データだけで、Better Auth のテーブルと memberships は残す。
 * 見学者のログイン状態を切らさないため。
 *
 * ここだけは組織スコープ（OrgContext）を通さない。全組織を対象にする
 * 保守操作であり、リポジトリ層の分離とは目的が異なるため。
 */
export async function resetDemoData(
  db: D1Database,
): Promise<{ organizationId: string; statements: number }> {
  // デモの組織はブートストラップ時に自動生成されるので、ID は実物を見て決める。
  // まだ何も無ければシード側の既定値（org_demo）が使われる。
  const org = await db
    .prepare("SELECT id FROM organizations ORDER BY created_at LIMIT 1")
    .first<{ id: string }>();

  // 基準日は実行時の日付。「3日後に更新予定」といった相対的な日付が
  // 日々ずれていかないよう、毎回いまの日付で組み立て直す。
  const statements = buildSeedStatements({
    today: new Date(),
    organizationId: org?.id,
  });

  // batch は全体が1つのトランザクションになる。途中で失敗しても
  // 空のアプリが見学者に見えることはない。
  await db.batch(statements.map((sql) => db.prepare(sql)));

  return { organizationId: org?.id ?? "org_demo", statements: statements.length };
}
