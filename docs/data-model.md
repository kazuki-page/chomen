# データモデル（ドラフト v0.1）

作成日: 2026-08-01
対象: Cloudflare D1 (SQLite) + Drizzle ORM

要件定義は [requirements.md](./requirements.md) を参照。

---

## 0. 全体方針

### 0.1 テナント分離をアプリケーション層で担保する

**D1 には Row Level Security が存在しない。** Postgres + RLS のようにデータベース側で組織を分離することができないため、以下の方針で担保する。

1. **すべての業務テーブルに `organization_id` を持たせる**（親テーブルを辿れば分かる場合でも非正規化して持つ）
2. **DB へのアクセスは必ずリポジトリ層を経由させ、素の Drizzle クエリを画面側から呼ばない**
3. リポジトリ層の入口で組織IDを必須引数にし、**すべてのクエリに `organization_id` 条件が入ることを型で強制する**
4. 「組織IDを渡し忘れたクエリ」が書けない構造にする（ヘルパー関数からしか組織スコープ付きDBハンドルを取得できないようにする）

> 非正規化は正規化の観点では冗長だが、**テナント越境バグは致命的**であり、JOIN を辿らないと組織が判定できない構造はその温床になる。ここでは安全側に倒す。

### 0.2 導出値は保存しない

| 概念 | 保存しない理由 |
|---|---|
| **空室状態** | 「有効な契約が存在しない Unit」として導出する。空室レコードを人が作る運用を廃止するため |
| **現在の家賃** | 家賃改定履歴から「本日時点で有効な最新レコード」として導出する |

### 0.3 共通カラム

全テーブルに以下を持たせる。

| カラム | 内容 |
|---|---|
| `id` | 主キー（`crypto.randomUUID()`） |
| `created_at` | 作成日時 |
| `updated_at` | 更新日時（修繕案件の**放置検知に使用**するため必須） |

### 0.4 日付は文字列で持つ

**日付のみの概念は `YYYY-MM-DD` の文字列（TEXT）で保持し、タイムスタンプにしない。**

対象: 契約日、更新予定日、退去日、適用開始日、入居日、発生日、完了日、設置日、募集開始日

理由は、本アプリが**「契約日の2年後の同日」を扱う**ため。日付をタイムスタンプで持つとタイムゾーンの解釈次第で1日ずれ、更新期限の計算が狂う。SQLite 上では `YYYY-MM-DD` の文字列がそのまま比較・ソートできるため、実用上の不利益もない。

時刻を伴う記録（`created_at` / `checked_at` / `completed_at` など）は timestamp を使う。

> 以下の各テーブル定義において、日付のみのカラムは TEXT (`YYYY-MM-DD`)、
> 日時のカラムは INTEGER (timestamp_ms) として実装されている。

---

## 1. 組織・ユーザー

### organizations（組織）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| name | text | 組織名 |

### user / session / account / verification（認証）

Better Auth のコアスキーマをそのまま使用する（`database/schema/auth.ts`）。
テーブル名・カラム名は Better Auth の既定に合わせてあり、変更する場合は `betterAuth()` 側のマッピングも直す必要がある。

業務テーブルと違い `organization_id` は持たない。ユーザーと組織の関係は `memberships` が持つ。

認証方式は **email + password**。メール送信サービスへの依存を避けるため、メール確認は無効にしている。
マジックリンクに切り替える場合は配信サービス（Resend など）の準備が必要。

### memberships（所属とロール）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| user_id | text | FK |
| role | text | `admin` / `editor` |

- `unique(organization_id, user_id)`
- 閲覧専用ロールは設けない

### invitations（招待）

一般サインアップを行わないため、管理者の招待によってのみユーザーが増える。

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| email | text | 招待先 |
| role | text | 付与するロール |
| token | text | 招待リンク用トークン |
| expires_at | integer | 有効期限 |
| accepted_at | integer | 受諾日時（null なら未使用） |
| invited_by | text | 招待した user_id |

---

## 2. 物件

### buildings（建物）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| name | text | 建物名 |
| address | text | 住所（帳票に出力するため保持。null 可） |

- 複数棟を前提とした構造にしておく（Phase 3 で UI 対応）

### units（貸出単位）

部屋と駐車場を同一テーブルで扱う。

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| building_id | text | FK |
| type | text | `room` / `parking` |
| code | text | `101` `205` / `P1` `P2` |
| display_order | integer | 一覧の並び順 |
| listing_rent | integer | 募集家賃（空室時のみ意味を持つ。null 可） |
| listing_started_at | integer | 募集開始日（同上） |
| note | text | 備考 |

- `unique(building_id, code)`
- **部屋番号と駐車場番号は体系が重複しないことを確認済み**
- 部屋契約と駐車場契約は別契約として扱う（実態はセット契約が主だが、モデルを分けたほうが単純）

> `listing_rent` / `listing_started_at` を Unit に持たせるのは、現行の「空室」レコードが持っていた情報の受け皿。
> 空室期間の履歴を分析したくなった場合は、別途 `vacancies` テーブルへ切り出す（現時点では不要）。

---

## 3. 入居者・契約

### tenants（入居者）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| name | text | 氏名 |
| birth_year | integer | 生年（年のみ。月日は保持しない） |

> **これ以上の個人情報は保持しない。** 連絡先・勤務先・緊急連絡先などは管理会社が保持しており、本アプリで参照する必要がない。
> GitHub 公開を前提とするため、保持する個人情報は最小限に留める。

- 同一人物が部屋と駐車場を借りる場合、複数の Lease から同一の Tenant を参照する

### leases（契約）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| unit_id | text | FK |
| tenant_id | text | FK |
| contract_date | integer | 契約日 |
| next_renewal_date | integer | 次回更新予定日（契約日の2年後の同日） |
| status | text | `pending`（入居手続き中） / `active`（入居中） / `ended`（退去済み） |
| ended_at | integer | 退去日（null 可） |

- **家賃はこのテーブルに持たせない**（下記 rent_revisions を参照）
- **空室判定**: 当該 Unit に `status = 'active'` の Lease が存在しなければ空室
  - `pending` はまだ住んでいないので数えない
- **1つの Unit に `active` は同時に1件まで。** 一覧・詳細は有効な契約を1件だけ
  JOIN で引く前提になっており、2件あると同じ部屋が二重に並ぶ
- **`pending` は `active` と同居できる。** 退居手続きが終わる前に次の入居者が
  決まることがあるため（下記「入居と退居の重なり」）

### rent_revisions（家賃改定履歴）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| lease_id | text | FK |
| effective_from | integer | 適用開始日 |
| amount | integer | 金額 |
| reason | text | `initial`（新規契約） / `renewal`（更新） / `adjustment`（途中改定） |
| procedure_id | text | 生成元の手続き（null 可） |
| confirmed | integer | 予定=0 / 確定=1 |

#### 更新手続きとの連動

1. 更新手続きの「更新通知内容の決定」ステップで**更新後家賃を確定** → `confirmed = 0`（予定）で1件作成、`effective_from` = 更新日
2. 「家賃変更後の金額での入金を確認」がチェックされた時点で `confirmed = 1`
3. **家賃据え置きの場合も同額で1件作成する**（`reason = 'renewal'`）。履歴が途切れず、更新ごとに1件が対応する

#### 導出

- **現在の家賃** = 当該 Lease の `effective_from <= 本日` かつ `confirmed = 1` のうち最新の `amount`
- 部屋ごとの家賃推移が追える。空室時の `listing_rent` と並べれば次回募集時の賃料判断の材料になる
- **改定レコードが1件も無い Lease があり得る。** 家賃が残っていない古い契約を「入居時期だけ」登録した場合で、
  そのとき現在の家賃は null（画面では「—」）になる。あとから契約の編集で金額を入れると `initial` として1件作られる

---

## 4. 手続き（ワークフロー）

現行 Notion の「入居 / 更新 / 退居」に相当する。**本アプリの中核。**

### procedures（手続き）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| lease_id | text | FK |
| type | text | `move_in` / `renewal` / `move_out` |
| status | text | `todo` / `in_progress` / `done` |
| scheduled_date | integer | 入居日 / 更新予定日 / 退居日 |
| completed_at | integer | 完了日時 |

### procedure_items（チェック項目）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| procedure_id | text | FK |
| key | text | テンプレート上のキー |
| label | text | 表示名 |
| sort_order | integer | 表示順 |
| checked_at | integer | チェック日時（null なら未完了） |
| value_text | text | 「更新通知内容の決定日」「支払いを確認した年月」等の付随入力 |
| note | text | メモ |

- 手続き作成時に `type` に応じたテンプレートから自動生成する
- テンプレートの内容は要件定義 4.3 を参照

### 自動化ルール

**操作者がステータスを手で選ぶ操作は発生させない。**

| トリガー | 処理 |
|---|---|
| 全チェック項目が完了 | `procedures.status` を `done` に |
| **入居手続きの開始** | Lease を `pending` で作成。Unit の `listing_*` をクリア（募集の取り下げ） |
| **契約日の訂正** | 未完了の入居手続きの予定日と、`initial` の家賃改定の適用開始日も揃える |
| **入居手続きの完了** | Lease を `active` に。**同じ部屋に残る `active` の Lease を `ended` に**。**2年後の更新手続きを自動生成** |
| **更新手続きの完了** | 家賃改定を `confirmed = 1` に。`leases.next_renewal_date` を更新。**次回の更新手続きを自動生成** |
| **退居手続きの完了** | Lease を `ended` に。`ended_at` を記録。Unit を空室化し、募集開始日・募集家賃の入力を促す |
| **退居手続きの開始** | 未完了の更新手続きと、その予定の家賃改定を削除する（完了を待たない） |
| **退居手続きの取り消し** | 手続きを削除し、契約の次回更新日で更新手続きを作り直す |

> 現行マニュアルには退居の完了状態が定義されていない（「進行中」のまま終わっている）。
> 本アプリでは「送金明細確認」をもって完了とする。

### 入居と退居の重なり

退居手続きが完了する前に、次の入居者の手続きが始まることがある。
この間、1つの部屋に `active`（今の入居者）と `pending`（次の入居者）が同居する。

入居手続きが先に完了した場合、**前の契約をその場で `ended` にする。**
`active` を2件にしないための措置で、退去日は退居手続きの予定日を暫定で借りる
（退居手続きが完了した時点で正式な退去日に上書きされる）。

来ないと決まった更新手続きは、**退居手続きを始めた時点**で削除する。
完了を待つと、その部屋の手続きに「次回更新」と「退居」が同時に並び、
どちらに従うのかが読み取れない。ホーム画面の「やること」にも
退去した入居者の名前が残り続ける。
完了済みの更新手続きは実際に行われた履歴なので残す。

**退居手続きは未完のまま残す。** ホーム画面の「やること」は
`procedures.status != 'done'` だけを見ており契約を参照しないため、
契約を終わらせてもやり残しは消えない。

> 結果として、**部屋一覧は新しい入居者に入れ替わり、ホームには退居の残作業が残る。**
> 見た目の最新性と、やり残しの追跡を両立させている。

### 契約の削除（退居とは別物）

**退居は「終了した契約」として履歴に残す。削除は入力そのものを無かったことにする。**
打ち間違い・二重登録を消すための操作なので、両者を混同させない。

削除では、ぶら下がるものを子から親の順に**明示的に**消す（D1 の cascade に依存しない）。

    procedure_items → procedures → rent_revisions → leases → tenants

入居者は**他の契約から参照されていないときだけ**消す。部屋と駐車場を同じ人が借りている場合に、
片方の契約を消して相手方が壊れるのを防ぐ。

---

## 5. 修繕・設備

### equipment（設備台帳）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| unit_id | text | FK（null = 共用部） |
| location_note | text | 共用部の場所（「1F 廊下」等） |
| category | text | エアコン / 給湯器 / コンロ / 換気扇 等 |
| maker | text | メーカー（null 可） |
| model_number | text | 型番（**null 可**） |
| installed_on | integer | 設置・交換日 |
| expected_life_years | integer | 交換目安年数 |

#### 設計方針

- **初期に全件登録しない。** 全室 × 設備数の一括入力は必ず破綻するため、**修繕案件の登録時に未登録の設備をその場で作成できる導線**を用意し、対応したものから台帳が育つ形にする
- **型番の手入力を必須にしない。** 銘板の写真だけで台帳として成立させる（`model_number` は null 可）
- **交換目安は通知しない。** 経過年数一覧を提供し、年次棚卸しや**退去による空室発生時**に確認する運用とする

### work_orders（修繕案件）

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| unit_id | text | FK（null = 共用部） |
| equipment_id | text | FK（null 可） |
| location_note | text | 共用部の場所 |
| title | text | 件名 |
| description | text | 内容 |
| occurred_on | integer | 発生日 |
| **handler** | text | `self`（自分たち） / `vendor`（業者） / `management`（管理会社） |
| **waiting_on** | text | **今ボールを持っているのは誰か** |
| status | text | `todo`（未対応） / `in_progress`（対応中） / `done`（完了） |
| cost | integer | 費用（金額のみ。明細は転記しない） |
| paid | integer | 支払済フラグ |
| completed_on | integer | 完了日 |
| updated_at | integer | **放置検知に使用** |

#### 設計方針

- 不具合連絡は管理会社経由で入り、その後「自分たちでやる / 業者に投げる / 管理会社に任せる」に分岐する。**この分岐後にボールの所在が不明になることが最大の課題**であるため、工程の細分化ではなく `handler` と `waiting_on` の2点を明示することを優先する
- **放置の可視化を最重要機能とする。** `status != 'done'` かつ `updated_at` が14日以上前の案件をホーム画面で強調する
- 費用は金額と請求書写真のみ。紙の明細を転記する運用は継続しないため、記録項目を最小化する
- 完了時に対象設備の `installed_on` / `model_number` を更新できる（任意）

### attachments（添付ファイル）

> **Phase 2・未使用。** テーブルは定義済みだが、R2 を有効化していないため
> 読み書きするコードはまだ無い。

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| entity_type | text | `work_order` / `equipment` |
| entity_id | text | 対象ID |
| r2_key | text | R2 上のオブジェクトキー |
| filename | text | 元ファイル名 |
| content_type | text | MIME |
| size | integer | バイト数 |
| uploaded_by | text | user_id |

- 用途: 修繕の before / after 写真、請求書の撮影、設備銘板の撮影

---

## 6. ホーム画面のクエリ

要件定義 5.1 の「やること」を構成するクエリ。

| セクション | 条件 |
|---|---|
| やること（手続き） | `procedures.status != 'done'` → 未チェックの先頭項目を「次にやること」として表示 |
| やること（修繕） | `work_orders.status != 'done'` |
| **放置案件** | 上記のうち `updated_at` が14日以上前 → 強調表示 |
| 空室 | `active` な Lease を持たない Unit |
| 今月の予定 | `procedures.scheduled_date` が当月内 |

---

## 7. Phase 3 で追加予定

### activity_logs（変更履歴）

3名で共同編集するため、誰がいつ何を変更したかを記録する。

| カラム | 型 | 内容 |
|---|---|---|
| id | text | PK |
| organization_id | text | FK |
| user_id | text | 実行者 |
| entity_type | text | 対象種別 |
| entity_id | text | 対象ID |
| action | text | `create` / `update` / `delete` |
| diff | text | 変更内容（JSON） |

---

## 8. 未決事項

| # | 項目 | 影響 |
|---|---|---|
| 1 | 共用部の粒度 | 現状は `location_note` のフリーテキスト。場所マスタが必要か要検討 |
| 2 | 業者マスタの要否 | 現状は `handler = 'vendor'` のみで業者名を持たない。Phase 2 で判断 |
| 3 | 更新料・委託手数料の金額記録 | 現状は `procedure_items.value_text` に年月のみ。金額が必要なら専用カラムを検討 |
| 4 | 帳票の内容 | 親へのヒアリング待ち |
