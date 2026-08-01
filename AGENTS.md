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
- 画面側から素の Drizzle クエリを呼ばない
- 組織スコープの無いクエリを書かない

### 導出値

次の2つは**保存しない**。カラムを増やして持たせようとしないこと。

- **空室状態** — 有効な契約が存在しない Unit として導出する
- **現在の家賃** — 家賃改定履歴から導出する

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
```

- **バインディング（D1/R2など）を `wrangler.jsonc` に追加したら `npm run cf-typegen` を実行する**こと。`worker-configuration.d.ts` は生成物であり、gitignore 済み
- Worker のエントリポイントは `workers/app.ts`
- ルート定義は `app/routes.ts`
