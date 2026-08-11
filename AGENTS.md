# AGENTS.md

このリポジトリで作業する AI エージェント向けの指示。

## プロジェクト概要

賃貸マンション（1棟40室・駐車場5台）の入居者・修繕管理アプリ。
実家の管理業務で実際に使用する。主な利用者は50代の家族2名、保守は本人。

設計の意図は必ず [docs/requirements.md](docs/requirements.md) と [docs/data-model.md](docs/data-model.md) を読んでから作業すること。
**これらの文書に書かれた設計判断には理由がある。** 実装の都合で覆す前に確認すること。

## 特に重要な制約

### 個人情報

- **入居者について保持してよいのは氏名と生年（年のみ）だけ。** 連絡先・住所・勤務先等のカラムを追加しない
- **実データをリポジトリにコミットしない。** シードデータは架空のものに限る

### テナント分離

- D1 には Row Level Security が無い。**全業務テーブルに `organization_id` を持たせ、リポジトリ層経由でのみ DB にアクセスする**
- **生の Drizzle クエリは `database/repositories/` の外に書かない。** loader / action からは必ずリポジトリ関数を呼ぶ
- リポジトリ関数は第1引数に `OrgContext` を取り、**すべてのクエリに `organization_id` 条件を含める**
- この規約により「組織条件が入っているか」の監査範囲が `database/repositories/` だけに限定される。破ると安全装置が無くなる
- リポジトリ関数の中で `new Date()` を呼ばない。基準日は引数（`asOf` など）で受け取る（テストで日付を固定するため）

### 導出値

次の2つは**保存しない**。カラムを増やして持たせようとしないこと。

- **空室状態** — 有効な契約が存在しない Unit として導出する
- **現在の家賃** — 家賃改定履歴から導出する。**改定が1件も無い契約もある**（金額の分からない過去の契約）ので、null を前提に書くこと

### UI

- 主な操作者は50代・Android。**タップ領域を大きく、文字を大きく**
- 表よりカードを優先する
- **ステータスを手で選ばせる UI を作らない。** 状態遷移はチェック操作の結果として自動で起きる
- 用語は現行の運用マニュアルの語彙に合わせる（「入居」「更新」「退居」「空室」）

## コミュニケーション

- 応答は日本語

## 技術スタック

| レイヤー | 採用 |
|---|---|
| フレームワーク | React Router v8（framework mode） |
| 実行環境 | Cloudflare Workers |
| ビルド | Vite + `@cloudflare/vite-plugin` |
| スタイル | Tailwind CSS v4 |
| DB | Cloudflare D1 (SQLite) + Drizzle ORM ※未導入 |
| ストレージ | Cloudflare R2 ※未導入 |
| 認証 | Better Auth ※未導入 |

React Router の書き方は `.agents/skills/react-router/` に公式のリファレンスがある。
framework mode を使っているので `references/framework-mode.md` を参照すること。

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # ビルド
npm run typecheck  # wrangler types + react-router typegen + tsc
npm run deploy     # ビルドして Cloudflare へデプロイ
npm run cf-typegen # wrangler.jsonc の binding から型を再生成

npm run db:generate       # スキーマ差分から SQL マイグレーションを生成
npm run db:migrate        # ローカル D1 に適用
npm run db:migrate:remote # 本番 D1 に適用
npm run db:seed           # 架空のデモデータを投入（業務データのみ入れ替え）
npm run db:reset-auth     # ローカルのアカウントを全消去し、初回セットアップをやり直す
```

> **検証でアカウントを作ったら消しておくこと。**
> ユーザーが1人でも存在すると `/signup` は招待リンクを要求するようになり、
> 開発者本人が初回セットアップできなくなる。

- **バインディング（D1/R2など）を `wrangler.jsonc` に追加したら `npm run cf-typegen` を実行する**こと。`worker-configuration.d.ts` は生成物であり、gitignore 済み
- Worker のエントリポイントは `workers/app.ts`
- ルート定義は `app/routes.ts`
- スキーマは `database/schema/`。**マイグレーション SQL を手書きせず、スキーマを編集して `npm run db:generate` で生成する**

## サーバー / クライアントの境界

- `*.server.ts` はクライアントバンドルに含められない。**画面のコンポーネント部分から値をimportするとビルドが落ちる**
- 画面とサーバーの双方で使う定数は `app/lib/constants.ts` に置く
- 型だけの import（`import type`）は消えるので `.server.ts` からでも問題ない
- `database/procedure-templates.ts` は純粋なデータなので画面から import してよい
- **`npm run build` を必ず通してから push する。** この境界違反は typecheck では出ず、ビルドで初めて落ちる
- 確認するときパイプに繋がない（`npm run build | tail` は tail の終了コードになり、失敗を見逃す）

## 認証

- **業務画面の loader / action は必ず `requireOrg(request)` を通す。** ここで返る `OrgContext` の組織スコープはログインユーザーの所属で確定する
- 管理者限定の操作は `requireAdmin(request)`
- **一般公開のサインアップは実装しない。** ユーザーは招待リンク経由でのみ増える。例外は初回セットアップ（ユーザーが1人もいないとき）だけ
- `findMembershipForUser` は組織スコープを持たない唯一のクエリ。ログインユーザーの所属組織を決める処理なので原理的に絞れない。**この例外を他へ広げないこと**
- `database/schema/auth.ts` のテーブル名・カラム名は Better Auth の既定。勝手に変えない
- 本番では `BETTER_AUTH_SECRET` を Cloudflare のシークレットとして設定する（`npx wrangler secret put BETTER_AUTH_SECRET`）。開発は `.dev.vars`
- 本番URLは https://chomen.kazuki.page （独自ドメイン）。`baseURL` はリクエストのオリジンから導出しているので、ドメインを足しても認証側の変更は不要
- 平文 HTTP は `workers/app.ts` で HTTPS へ 301 リダイレクトする。localhost は対象外

### パスワードの再発行

- **再設定リンクを受け取れるのは管理者だけ。** 管理者以外が依頼した場合は、本人ではなく
  **管理者に「依頼が届いた」と通知**する。分岐は `database/services/password-reset.server.ts`
- 理由は2つ。ご両親のキャリアメールに届かない事故を避けること、鍵になるメールを1つに絞ること
- 通知メールに**再設定リンクを入れない**。管理者が本人確認をしてから設定画面で発行する
- 管理者以外の受け皿は設定画面の「再設定リンク」。Better Auth と同じ形式で `verification` に積むので、
  メール経由のリンクと同じ画面・同じ検証を通る
- **申請画面の応答は、登録の有無・権限・送信の成否によらず必ず同じ文言。** ここが変わると情報が漏れる
- メール送信は `app/lib/mail.server.ts`（Resend の HTTP API）。**失敗しても throw しない**。
  例外が申請画面まで伝わると、応答の差からメールアドレスの存在が読み取れてしまう
- `RESEND_API_KEY` は Cloudflare のシークレット。`MAIL_FROM` は送信元。未設定でもアプリは動く（送られず警告ログのみ）

## セキュリティ上の決めごと

- **ログイン・登録・パスワード再発行には自前のレート制限を通す**（`database/services/rate-limit.server.ts`）。
  Better Auth の rateLimit は HTTP ハンドラ経由にしか効かず、`auth.api.*` の直接呼び出しは素通りするため
- レート制限テーブルは認証前に使うため `organization_id` を持たない。**この例外を業務クエリに広げない**
- セキュリティヘッダは `workers/app.ts` で全レスポンスに付ける
- ログイン失敗のメッセージは**メールアドレスの存在を推測させない**汎用文言のままにする
- リダイレクト先を受け取るときは同一サイトのパスに限定する（`safeNext`）
- 状態を変える操作は必ず POST。GET で副作用を起こさない
  （セッション Cookie が SameSite=Lax なので、これが CSRF の主防御になっている）

## 状態遷移の実装場所

- 手続きの完了と、それに伴う自動化（次回更新手続きの生成・契約の有効化/終了・募集情報のクリア）は
  `database/services/procedures.server.ts` に集約する
- **画面側で状態遷移を書かない。** loader / action からサービス関数を呼ぶだけにする
- D1 に対話的トランザクションは無いため、連鎖する書き込みは `db.batch()` でまとめる

## D1 の制限

- **1つのクエリに渡せるバインド変数は100個まで。**
  複数行をまとめて `insert().values([...])` すると、行数 × カラム数が100を超えた時点で実行時エラーになる。
  型チェックもビルドも通り、少ない行数のテストでも再現しないため見逃しやすい。
  一括登録のように行数が読めない処理では、**必ず分割して `db.batch()` で流すこと**
  （例: `database/services/equipment-import.server.ts` の `ROWS_PER_INSERT`）
- 一括処理を検証するときは、**上限を超える行数で必ず試す**こと。数行では通ってしまう

## 日付の扱い

- **日付のみの概念（契約日・更新予定日・入居日・発生日など）は `YYYY-MM-DD` の文字列で保持する。** タイムスタンプにしない
- 理由: 「契約日の2年後の同日」を扱うため、タイムゾーン起因の日付ずれが致命的になる
- 時刻を伴う記録（`createdAt` / `checkedAt` / `completedAt` など）は timestamp_ms を使う
