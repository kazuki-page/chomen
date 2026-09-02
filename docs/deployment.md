# デプロイ運用

## 自動化の範囲

GitHub ActionsのCIは次の順で動く。

1. Pull Request: テスト、型検査、ビルドだけを実行する
2. `main`へのpush: 同じ品質検査を実行する
3. 品質検査の成功後: デモD1へマイグレーションを適用する
4. デモWorkerをデプロイする
5. `https://chomen-demo.kazuki.page/login` の疎通を確認する
6. GitHubの `production` Environmentで人の承認を待つ
7. 承認後: 本番D1へマイグレーションを適用する
8. 本番Workerをデプロイする
9. `https://chomen.kazuki.page/login` の疎通を確認する

本番D1と本番Workerは、デモの成功だけでは変更しない。GitHub上で明示的に承認した
場合だけ、デモで検証したものと同じコミットを本番へ配る。

## GitHubの初期設定

### デモ環境

リポジトリの Settings → Environments で `demo` Environmentを作り、以下の
Environment secretsを登録する。

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | デモWorkerとD1があるCloudflareアカウントID |
| `CLOUDFLARE_API_TOKEN` | デモ配布用のCloudflare APIトークン |

### 本番環境

このワークフローをpushする**前に**、Settings → Environmentsで `production`
Environmentを作り、次を設定する。

1. Required reviewersに、本番配布を判断するユーザーを指定する
2. 一人運用では Prevent self-reviewを有効にしない
3. Deployment branches and tagsを `main` だけに制限する
4. 次のEnvironment secretsを登録する
5. Environment variable `PRODUCTION_DEPLOY_ENABLED` を値 `true` で登録する

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 本番WorkerとD1があるCloudflareアカウントID |
| `CLOUDFLARE_API_TOKEN` | 本番配布専用のCloudflare APIトークン |

本番用とデモ用は、監査と個別失効のため別トークンにする。同じCloudflareアカウントを
使っていても、GitHub上ではEnvironmentごとに別々に保管する。

`PRODUCTION_DEPLOY_ENABLED` は、Environmentの設定漏れによる無承認デプロイを防ぐ
追加ガードである。値が無い、または `true` 以外なら、本番D1へ触れる前にジョブが失敗する。

設定完了後は、デモの動作を確認してからGitHub ActionsのReview deploymentsを開き、
`production` を選んでApprove and deployを実行する。

### Cloudflare APIトークン

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
本番にも独立した `deploy-production` groupを設定し、承認済みの本番処理を中断しない。

- 品質検査失敗: デモ環境は変更されない
- マイグレーション失敗: Workerはデプロイされない
- Workerデプロイ失敗: 適用済みのD1マイグレーションは自動では戻らない
- 疎通確認失敗: デプロイ履歴とWorkerログを確認し、必要なら直前のWorkerへ戻す
- デモ確認で問題を発見: 本番を承認せず、修正を新しいpushとして出す

WorkerのロールバックはD1を元に戻さない。マイグレーションは原則として、既存コードと
共存できるカラム・テーブルの追加を先に行い、削除や名称変更は後続リリースへ分ける。

## 手動での再実行

一時的なGitHub Actions障害時はローカルからデモだけを再実行できる。

```bash
npm run db:migrate:demo
npm run deploy:demo
```

本番を手動復旧する場合も、デモ確認後に次の順で実行する。

```bash
npm run db:migrate:remote
npm run deploy
```

デモの実行や成功は、本番の実行許可を兼ねない。
