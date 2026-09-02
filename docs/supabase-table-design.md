# 日高オーダー Supabaseテーブル設計案

- 設計版: 1
- 作成日: 2026-09-01
- 対象アプリ: 日高オーダー v1.9.0
- 状態: 確認用。Supabaseへの作成・接続・データ移行は未実施

> 実際の接続先は既存の `shochu-keep-ledger` に決定したため、`stores` は新規作成せず既存テーブルを共用する。所有者列と店舗IDの実装上の変更は、[shochu-keep-ledger共用設計](shochu-project-integration.md)を優先する。

関連資料:

- [現在データからSupabaseへの詳細対応表](supabase-data-mapping.md)
- [Supabase・端末内併用の保存方式](supabase-sync-design.md)
- [本人専用の認証・権限・キー管理](supabase-security-design.md)
- [現在バックアップの初回データ移行](supabase-initial-import.md)
- [shochu-keep-ledgerの既存店舗との共用](shochu-project-integration.md)

## 1. 設計方針

1. 現在の店舗ID `hidaka-001`、メニューID `base-001` などは文字列のまま維持する。
2. メニューの現在価格と、過去に注文した時点の価格を分けて保存する。
3. AIの提案と実際の注文を別テーブルにし、変更理由を追跡できるようにする。
4. 提供休止と当日の品切れを分ける。提供休止はメニューマスタ、品切れは日付別に保存する。
5. 削除はすぐ消去せず、`deleted_at` を使った論理削除を基本とする。
6. すべてのデータに所有者 `owner_id` を持たせ、本人だけが読み書きできるようにする。
7. 現在の端末内保存は、オフライン時の一時保存として残せる構造にする。

## 2. テーブルの関係

```text
auth.users
  └─ stores（店舗）
       ├─ menu_items（メニュー）
       ├─ store_settings（店舗別の注文設定）
       ├─ daily_menu_status（当日の品切れ）
       ├─ visits（来店・会計）
       │    ├─ order_items（実際の注文）
       │    └─ visit_feedback（満足度・感想）
       └─ recommendation_runs（AI提案1回分）
            └─ recommendation_items（AIが提案した商品）
                  └─ order_items.source_recommendation_item_id
```

## 3. テーブル一覧

### 3.1 `stores` — 店舗

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | text | ○ | 現在の `hidaka-001` を維持 |
| `owner_id` | uuid | ○ | Supabase Authの利用者ID |
| `name` | text | ○ | 店名 |
| `area` | text |  | エリア |
| `memo` | text |  | 店舗メモ |
| `is_active` | boolean | ○ | 利用中か |
| `created_at` | timestamptz | ○ | 作成日時 |
| `updated_at` | timestamptz | ○ | 更新日時 |
| `deleted_at` | timestamptz |  | 論理削除日時 |

主キーは `owner_id + id` の複合主キー。今回の初期行は `hidaka-001 / やきとり日高`。アプリ内の店舗IDは変更しない。

### 3.2 `menu_items` — メニューマスタ

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | text | ○ | 現在の `base-001` などを維持 |
| `owner_id` | uuid | ○ | 所有者 |
| `store_id` | text | ○ | `stores.id` |
| `name` | text | ○ | メニュー名 |
| `category` | text | ○ | `drink / small / skewer / main / finish / dessert / fee` |
| `price` | integer | ○ | 現在価格・円 |
| `tags` | text[] | ○ | 現在の日本語タグを配列で保存 |
| `is_actual_price` | boolean | ○ | 実額か目安か |
| `is_available` | boolean | ○ | 提供中／休止中 |
| `recommendation_type` | text | ○ | `normal / recommended / priority / avoid` |
| `offering_type` | text | ○ | `regular / seasonal / limited` |
| `seasons` | text[] | ○ | `spring / summer / autumn / winter` |
| `available_from` | date |  | 提供開始日 |
| `available_until` | date |  | 提供終了日 |
| `memo` | text |  | 販売条件など |
| `created_at` | timestamptz | ○ | 作成日時 |
| `updated_at` | timestamptz | ○ | 最終更新日時 |
| `deleted_at` | timestamptz |  | 削除済みメニューの保存 |

制約案:

- 主キーは `owner_id + id` の複合主キー
- `owner_id + store_id` は同じ所有者の `stores` を参照
- `price >= 0`
- `available_until >= available_from`
- `category` と `offering_type` は定義済みの値だけ許可
- メニューを削除しても過去の注文履歴は削除しない

### 3.3 `store_settings` — 店舗別の既定値・固定ルール

| 項目 | 型 | 必須 | 現在の日高設定 |
|---|---|---:|---|
| `id` | uuid | ○ | 設定ID |
| `owner_id` | uuid | ○ | 所有者 |
| `store_id` | text | ○ | `hidaka-001` |
| `default_budget` | integer | ○ | 3000円・上限ではなく目安 |
| `default_hunger` | text | ○ | `normal` |
| `default_skewer_count` | smallint | ○ | 3本 |
| `must_shishito` | boolean | ○ | true |
| `avoid_recent_orders` | boolean | ○ | true |
| `recent_history_depth` | smallint | ○ | 重複判定に使う履歴回数 |
| `fixed_charge_name` | text |  | 割代（焼酎キープ） |
| `fixed_charge_amount` | integer |  | 220円 |
| `fixed_charge_position` | text | ○ | `last` |
| `hunger_dish_counts` | jsonb | ○ | `light:1 / normal:2 / hearty:3` |
| `extra_rules` | jsonb | ○ | 将来追加する固定ルール |
| `updated_at` | timestamptz | ○ | 更新日時 |

`store_id` と `owner_id` の組み合わせは1行だけにし、同じ所有者の `stores` を参照する。

### 3.4 `daily_menu_status` — 日付別の品切れ

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | uuid | ○ | 状態ID |
| `owner_id` | uuid | ○ | 所有者 |
| `store_id` | text | ○ | 店舗ID |
| `menu_id` | text | ○ | 対象メニュー |
| `service_date` | date | ○ | 品切れ当日 |
| `status` | text | ○ | 当面は `sold_out` |
| `memo` | text |  | 理由など |
| `created_at` | timestamptz | ○ | 登録日時 |

`owner_id + store_id + menu_id + service_date` を重複不可にする。店舗・メニューへの外部キーにも `owner_id` を含める。翌日は検索対象外になるため、現在の「翌日に自動リセット」を維持できる。

### 3.5 `visits` — 来店・会計・注文時状況

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | text | ○ | 現在の来店ID／履歴IDを移行可能 |
| `order_history_id` | text |  | 現在の注文履歴ID |
| `owner_id` | uuid | ○ | 所有者 |
| `store_id` | text | ○ | 店舗ID |
| `visited_at` | timestamptz | ○ | 来店日時 |
| `visit_time_known` | boolean | ○ | 時刻が実測か |
| `recorded_at` | timestamptz | ○ | 記録日時 |
| `budget` | integer |  | 当日の目安予算 |
| `hunger` | text |  | `light / normal / hearty` |
| `skewer_count` | smallint |  | 指定した串本数 |
| `moods` | text[] | ○ | 今日の気分 |
| `starting_drink_menu_id` | text |  | 最初の飲み物 |
| `starting_drink_name` | text |  | 最初の飲み物名の写し |
| `must_shishito` | boolean |  | ししとう必須 |
| `want_finish` | boolean |  | 締め希望 |
| `avoid_recent` | boolean |  | 最近の重複回避 |
| `shochu_keep_used` | boolean |  | 焼酎キープ利用 |
| `visit_stage` | text |  | 1軒目／2軒目 |
| `plans_second_venue` | boolean |  | 2軒目予定 |
| `seafood_requested` | boolean |  | 魚介希望 |
| `meat_requested` | boolean |  | 肉希望 |
| `seasonal_requested` | boolean |  | 季節物希望 |
| `stay_duration_minutes` | integer |  | 滞在時間希望 |
| `other_wishes` | text |  | その他の希望 |
| `total_amount` | integer |  | 実際の会計金額 |
| `memo` | text |  | 来店メモ |
| `created_at` | timestamptz | ○ | 作成日時 |
| `updated_at` | timestamptz | ○ | 更新日時 |
| `deleted_at` | timestamptz |  | 論理削除日時 |

注文時に未入力だった条件は `null` でよい。現在の操作性を変えず、後から追加できる。

主キーは `owner_id + id` の複合主キーとし、店舗への外部キーにも `owner_id` を含める。

### 3.6 `recommendation_runs` — AI提案1回分

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | uuid | ○ | 提案ID |
| `owner_id` | uuid | ○ | 所有者 |
| `store_id` | text | ○ | 店舗ID |
| `visit_id` | text |  | 記録後に `visits.id` と関連付け |
| `generated_at` | timestamptz | ○ | 提案日時 |
| `algorithm_version` | text | ○ | アプリ／提案ロジックの版 |
| `conditions` | jsonb | ○ | 提案時条件の完全な写し |
| `estimated_total` | integer |  | 提案合計 |
| `notices` | text[] | ○ | 予算超過・候補不足など |

組み直すたびに別の提案として残すか、最終提案だけ保存するかは接続前に決める。初期案は「注文を記録した時点の最終提案だけ保存」。

店舗・来店への外部キーには `owner_id` を含める。

### 3.7 `recommendation_items` — AIが提案した商品

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | uuid | ○ | 提案明細ID |
| `owner_id` | uuid | ○ | 所有者 |
| `recommendation_run_id` | uuid | ○ | 提案ID |
| `menu_id` | text |  | メニューマスタ参照 |
| `menu_name` | text | ○ | 提案時の商品名の写し |
| `order_index` | smallint | ○ | 提案順 |
| `quantity` | smallint | ○ | 数量 |
| `unit_price` | integer |  | 提案時価格 |
| `recommendation_reason` | text |  | 選定理由 |

商品名と価格を写しておくため、後でメニュー名や価格が変わっても当時の提案を再現できる。

提案への外部キーには `owner_id` を含める。

### 3.8 `order_items` — 実際に注文した商品

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `id` | text | ○ | 現在の注文明細IDを移行可能 |
| `owner_id` | uuid | ○ | 所有者 |
| `visit_id` | text | ○ | 来店ID |
| `menu_id` | text |  | メニューマスタ参照。未登録品はnull可 |
| `menu_name` | text | ○ | 注文時の商品名の写し |
| `order_index` | smallint | ○ | 注文順 |
| `quantity` | smallint | ○ | 数量 |
| `unit_price` | integer |  | 注文時価格 |
| `subtotal` | integer |  | 小計 |
| `source` | text | ○ | `recommended / manual / changed / fixed / legacy` |
| `recommendation_reason` | text |  | 当初の選定理由 |
| `source_recommendation_item_id` | uuid |  | 元のAI提案明細 |
| `change_reason` | text |  | 手動変更理由 |
| `created_at` | timestamptz | ○ | 作成日時 |
| `updated_at` | timestamptz | ○ | 更新日時 |
| `deleted_at` | timestamptz |  | 論理削除日時 |

`menu_name` と `unit_price` は履歴側に必ず残す。これにより価格変更後も過去会計が変わらない。

主キーは `owner_id + id` の複合主キーとし、来店・メニュー・元提案への外部キーにも `owner_id` を含める。

### 3.9 `visit_feedback` — 満足度・フィードバック

| 項目 | 型 | 必須 | 内容 |
|---|---|---:|---|
| `visit_id` | text | ○ | 主キー・来店ID |
| `owner_id` | uuid | ○ | 所有者 |
| `satisfaction` | smallint |  | 1〜5 |
| `would_order_again` | boolean |  | また頼みたい |
| `avoid_next_time` | boolean |  | 次回は避けたい |
| `amount_feeling` | text |  | `small / just / large` |
| `price_feeling` | text |  | `cheap / fair / expensive` |
| `comment` | text |  | コメント |
| `created_at` | timestamptz | ○ | 作成日時 |
| `updated_at` | timestamptz | ○ | 更新日時 |

初期段階は現在のアプリと同じく「来店全体の感想」とする。商品単位の感想が必要になった場合だけ、将来 `item_feedback` を追加する。

主キーは `owner_id + visit_id` の複合主キーとする。

## 4. 現在のデータとの対応

| 現在のデータ | Supabase |
|---|---|
| `stores` | `stores` |
| `menu` | `menu_items` |
| `preferences` と固定値 | `store_settings` |
| `outOfStock` | `daily_menu_status` |
| `history` 1件 | `visits` 1件 |
| `history.items` | `order_items` |
| `history.context` | `visits` の状況項目 |
| `history.feedback` | `visit_feedback` |
| 変更前の `changedFrom` | `recommendation_items` |
| 実際に変更した商品 | `order_items` |
| `changeReason` | `order_items.change_reason` |
| `pendingOrder` | 当面は端末内。確定時にSupabaseへ保存 |
| `initialMenu` | GitHubのCSVを初期投入用データとして維持 |

## 5. 現在の注文ルールの保存場所

| 現在のルール | 保存先 |
|---|---|
| 予算3000円は目安 | `store_settings.default_budget` |
| 軽め1品・普通2品・がっつり3品 | `store_settings.hunger_dish_counts` |
| 串本数を優先 | `visits.skewer_count` と `store_settings.default_skewer_count` |
| ししとう必須 | `visits.must_shishito` と `store_settings.must_shishito` |
| 締めチェックなしなら完全除外 | `visits.want_finish` とアプリの注文ロジック |
| 最近の注文を自動で避ける | `store_settings.avoid_recent_orders` と注文履歴 |
| 焼酎キープ割代220円を最後に追加 | `store_settings` と `order_items` の固定明細 |
| 季節・期間外・休止中を除外 | `menu_items` |
| 当日の品切れを除外 | `daily_menu_status` |

注文の選び方そのものは当面アプリ側に残す。Supabaseは条件・結果・理由を保存し、現在の注文ロジックを削除しない。

## 6. 焼酎キープ管理との将来接続

現在は次の2点だけで接続準備ができる。

- `visits.shochu_keep_used` で利用有無を保持
- 割代220円を `order_items` の `source = fixed` として保存

焼酎キープ管理アプリ側のテーブルが決まった後、`visits` に `bottle_keep_id` または `bottle_usage_id` を追加する。今回は未確定の外部IDを作らない。

## 7. ハラケンAIから参照しやすい点

- `visits` から前回条件と会計を取得できる。
- `order_items` から最近頼んだ回数・最後に頼んだ日を集計できる。
- `recommendation_items` と `order_items` の差から、AI提案を変更する傾向を分析できる。
- `visit_feedback` から満足度の高い条件・組み合わせを分析できる。
- `menu_items` から現在提供中の季節・期間限定商品だけを取得できる。

## 8. セキュリティ方針

- 各テーブルでRow Level Security（RLS）を有効にする。
- 読み書きは `authenticated` のみに許可する。
- 各行の `owner_id` と `auth.uid()` が一致する場合だけ操作を許可する。
- 未ログインの `anon` にはメニュー・履歴とも権限を与えない。
- `service_role` キーはブラウザやGitHubへ置かない。
- GitHub Pagesで使う公開可能なキーだけではデータを読めず、ログインとRLSの両方が必要な状態にする。

Supabase公式ドキュメントでも、公開スキーマのテーブルごとにRLSと権限を設定し、ブラウザからのアクセスはSupabase Authと組み合わせる構成が案内されている。

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/tables

## 9. この設計でまだ実行しないこと

- Supabaseプロジェクトの作成
- SQLの実行
- 認証設定
- APIキーの登録
- 現在のメニュー・履歴のアップロード
- 公開版アプリの接続変更

この設計の確認後、次の工程で実際に実行できるSQL案を作成する。
