# デプロイ運用

## 自動化の範囲

GitHub ActionsのCIは次の順で動く。

1. Pull Request: テスト、型検査、ビルドだけを実行する
2. `main`へのpush: 同じ品質検査を実行する
3. 品質検査の成功後: デモD1へマイグレーションを適用する
4. デモWorkerをデプロイする
5. `https://chomen-demo.kazuki.page/login` の疎通を確認する

本番D1と本番Workerは自動変更しない。デモで動作を確認した後、従来どおり
人が本番マイグレーションとデプロイを実行する。

```bash
npm run db:migrate:remote
npm run deploy
```

## GitHubの初期設定

リポジトリの Settings → Environments で `demo` Environmentを作り、以下の
Environment secretsを登録する。

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | デモWorkerとD1があるCloudflareアカウントID |
| `CLOUDFLARE_API_TOKEN` | CI専用のCloudflare APIトークン |

APIトークンはCloudflareの「Edit Cloudflare Workers」テンプレートを出発点に、
対象アカウントと `kazuki.page` ゾーンへ範囲を限定する。Workerの配布とD1の
マイグレーションに必要な編集権限だけを持たせ、Global API Keyは使わない。

`BETTER_AUTH_SECRET`、`BOOTSTRAP_SECRET`、`RESEND_API_KEY` はGitHubへ登録しない。
これらはWorker側のSecretとして保持され、デプロイ後も引き継がれる。
特にデモ環境へ `RESEND_API_KEY` を登録してはいけない。

`main` のbranch protectionでは、マージ前にCIの `quality` ジョブ成功を必須にする。

## 同時実行と失敗時の扱い

デモ配布には `deploy-demo` concurrency groupを設定している。新しいpushが来ても、
実行中のマイグレーションやデプロイは中断しない。

- 品質検査失敗: デモ環境は変更されない
- マイグレーション失敗: Workerはデプロイされない
- Workerデプロイ失敗: 適用済みのD1マイグレーションは自動では戻らない
- 疎通確認失敗: デプロイ履歴とWorkerログを確認し、必要なら直前のWorkerへ戻す

WorkerのロールバックはD1を元に戻さない。マイグレーションは原則として、既存コードと
共存できるカラム・テーブルの追加を先に行い、削除や名称変更は後続リリースへ分ける。

## 手動での再実行

一時的なGitHub Actions障害時はローカルからデモだけを再実行できる。

```bash
npm run db:migrate:demo
npm run deploy:demo
```

この操作も本番の実行許可を兼ねない。本番はデモ確認後に別途判断する。
