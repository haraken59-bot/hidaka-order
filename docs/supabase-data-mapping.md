# 日高オーダー 現在データ → Supabase対応表

- 設計版: 1
- 作成日: 2026-09-01
- 対象アプリ: 日高オーダー v1.9.0
- 対象バックアップ: `日高オーダー_全データ_2026-08-31 (2).json`
- 状態: 移行設計のみ。Supabaseへの登録は未実施

## 1. 確認した現在データ

スマホ公開版から保存された対象バックアップは、完全バックアップ形式バージョン1で、次の内容を含む。

| データ | 件数・状態 |
|---|---:|
| 現在のメニュー | 101件 |
| 初期メニュー | 100件 |
| 注文履歴 | 6件 |
| 店舗情報 | 旧形式のため未収録 |
| 未記録の注文案 | 保存対象 |
| 利用者設定 | 保存対象 |
| 当日の品切れ | 保存対象 |

旧形式に店舗情報や新しい履歴項目がなくても、現在のアプリが読み込み時に既定店舗 `hidaka-001` と安定IDを補完する。移行処理でも同じ補完規則を使う。

## 2. 移行の基本ルール

1. 元のJSONは変更せず、移行前バックアップとして残す。
2. 先に現在のアプリと同じ正規化処理を通し、その結果をSupabase用の行へ変換する。
3. 既存の店舗ID・メニューID・履歴ID・注文明細IDは維持する。
4. IDがない旧データだけ、現在のアプリと同じ規則でIDを補完する。
5. 過去の注文価格は `order_items.unit_price` に保存し、現在のメニュー価格とは分離する。
6. 同じIDを再度取り込んでも重複しないよう、追加ではなく `upsert` を使う。
7. `pendingOrder` は確定した注文履歴ではないため、初回移行ではSupabaseへ送らず端末内に残す。

## 3. ルートデータの対応

| 現在の保存項目 | Supabase保存先 | 変換方針 |
|---|---|---|
| `stores` | `stores` | ない旧形式は `hidaka-001 / やきとり日高` を補完 |
| `activeStoreId` | 端末設定 | ログイン後の選択店舗として端末内に保持 |
| `menu` | `menu_items` | 現在利用している101件を移行対象にする |
| `initialMenu` | GitHubの初期CSV | Supabaseへ二重登録せず、復元・初期投入用としてGitHubに維持 |
| `history` | `visits`、`order_items`、`visit_feedback` | 来店単位と明細単位に分解 |
| `preferences` | `store_settings` | 店舗別の既定値として1行にまとめる |
| `outOfStock` | `daily_menu_status` | 保存日が当日である場合だけ移行候補にする |
| `pendingOrder` | 端末内 | 注文記録時に初めてSupabaseへ保存 |
| `menuSortMode` | 端末設定 | 画面表示だけの設定なのでSupabase共有はしない |
| `dataSchemaVersion` | 移行ログ | アプリ側の互換判定に使い、業務テーブルには保存しない |
| `defaultMenuVersion` | GitHub／移行ログ | 初期CSVの版として管理する |

## 4. 店舗データ

| 現在 | `stores` | 補足 |
|---|---|---|
| `store.id` | `id` | `hidaka-001` を維持 |
| `store.name` | `name` | やきとり日高 |
| なし | `owner_id` | ログイン中の `auth.uid()` |
| なし | `area` | 初回は空欄 |
| なし | `memo` | 初回は空欄 |
| なし | `is_active` | `true` |
| なし | `created_at`、`updated_at` | 移行実行日時 |

## 5. メニューデータ

| 現在の `menu` | `menu_items` | 変換 |
|---|---|---|
| `id` | `id` | そのまま |
| `storeId` | `store_id` | 未設定なら `hidaka-001` |
| `name` | `name` | そのまま |
| `price` | `price` | 円の整数 |
| `category` | `category` | `drink / small / skewer / main / finish / dessert / fee` |
| `tags` | `tags` | 文字列配列 |
| `actual` | `is_actual_price` | 真偽値 |
| `available` | `is_available` | 真偽値。恒常的な提供中／休止中 |
| なし | `recommendation_type` | 初回は `normal` |
| `offeringType` | `offering_type` | `regular / seasonal / limited` |
| `seasons` | `seasons` | 季節コードの配列 |
| `availableFrom` | `available_from` | 空欄は `null` |
| `availableUntil` | `available_until` | 空欄は `null` |
| `memo` | `memo` | そのまま |
| `updatedAt` | `updated_at` | 有効な日時でなければ移行実行日時 |
| なし | `created_at` | 移行実行日時 |
| なし | `deleted_at` | 初回は `null` |

旧形式のメニューに `storeId`、提供状態、提供区分などがない場合は、現在のアプリの正規化後の値を使う。CSVの現在値を別に上書きして、スマホで編集した内容を失わせない。

## 6. 店舗別設定

| 現在の `preferences`／固定値 | `store_settings` | 初期値 |
|---|---|---:|
| `budget` | `default_budget` | 3000 |
| `hunger` | `default_hunger` | 現在値、なければ `normal` |
| `skewerCount` | `default_skewer_count` | 現在値、なければ3 |
| `mustShishito` | `must_shishito` | 現在値 |
| 内部固定 | `avoid_recent_orders` | `true` |
| 内部固定 | `recent_history_depth` | 接続前に現在ロジックと同じ回数を設定 |
| 固定料金名 | `fixed_charge_name` | 割代（焼酎キープ） |
| 固定料金 | `fixed_charge_amount` | 220 |
| 固定位置 | `fixed_charge_position` | `last` |
| 空腹度ルール | `hunger_dish_counts` | `{"light":1,"normal":2,"hearty":3}` |

`drink`、`moods`、`wantFinish` はその日の選択として扱うため、共有する既定設定にはしない。画面の前回選択値として端末内に残す。

## 7. 注文履歴

### 7.1 履歴1件 → `visits`

| 現在の `history` | `visits` | 変換 |
|---|---|---|
| `visitId` | `id` | そのまま。旧形式は `visit-{history.id}` |
| `id` | `order_history_id` | そのまま |
| `storeId` | `store_id` | 未設定なら `hidaka-001` |
| `visitedAt` | `visited_at` | 時刻不明なら日付の00:00 +09:00 |
| `visitTimeKnown` | `visit_time_known` | 旧形式は `false` |
| `recordedAt` | `recorded_at` | ない場合は移行日時 |
| `total` | `total_amount` | 保存値を優先。なければ明細合計 |
| `date` | `visited_at` の日付 | 補助項目として使用 |
| `context.*` | 各状況列 | 下記対応表を使用 |

### 7.2 状況 → `visits`

| 現在の `context` | `visits` |
|---|---|
| `budget` | `budget` |
| `hunger` | `hunger` |
| `skewerCount` | `skewer_count` |
| `moods` | `moods` |
| `startingDrinkId` | `starting_drink_menu_id` |
| `mustShishito` | `must_shishito` |
| `wantFinish` | `want_finish` |
| `avoidRecent` | `avoid_recent` |
| `shochuKeepUsed` | `shochu_keep_used` |
| `visitStage` | `visit_stage` |
| `plansSecondVenue` | `plans_second_venue` |
| `seafoodRequested` | `seafood_requested` |
| `meatRequested` | `meat_requested` |
| `seasonalRequested` | `seasonal_requested` |
| `stayDurationMinutes` | `stay_duration_minutes` |
| `otherWishes` | `other_wishes` |

旧履歴に状況がない項目は、推測で埋めず `null` または空配列にする。

### 7.3 注文明細 → `order_items`

| 現在の `history.items` | `order_items` | 変換 |
|---|---|---|
| `lineId` | `id` | そのまま。旧形式は `{履歴ID}-line-{注文順}` |
| 履歴の `visitId` | `visit_id` | 親来店ID |
| `menuId` | `menu_id` | 名前一致で補完。見つからなければ `null` |
| `name` | `menu_name` | 注文時の商品名として必ず保存 |
| `orderIndex` | `order_index` | 旧形式は配列順 + 1 |
| `quantity` | `quantity` | 旧形式は1 |
| `unitPrice` または `price` | `unit_price` | 注文時価格として保存 |
| `subtotal` | `subtotal` | 単価 × 数量 |
| `source` | `source` | 旧形式は `legacy` |
| `recommendationReason` | `recommendation_reason` | あれば保存 |
| `changeReason` | `change_reason` | あれば保存 |
| `aiSuggestion` | `recommendation_items` | 元提案の写しとして分離 |

旧履歴の `name` と `price` だけでも、現在のメニュー名と照合して `menu_id` を補完できる。価格はメニューマスタの現在価格で置き換えず、履歴の価格を優先する。

## 8. AI提案と実際の注文

現在の履歴に変更前の `aiSuggestion` がある明細だけ、初回移行時に次の行を作る。

1. 来店に対応する `recommendation_runs` を1行作る。
2. `aiSuggestion` を `recommendation_items` に保存する。
3. 実際の `order_items.source_recommendation_item_id` をその提案明細へつなぐ。
4. `changeReason` を `order_items.change_reason` に残す。

過去履歴にAI元提案がない場合は推測して作らない。

## 9. フィードバック

| 現在の `feedback` | `visit_feedback` |
|---|---|
| `satisfaction` | `satisfaction` |
| `wouldOrderAgain` | `would_order_again` |
| `avoidNextTime` | `avoid_next_time` |
| `amount` | `amount_feeling` |
| `priceFeeling` | `price_feeling` |
| `comment` | `comment` |
| `updatedAt` | `updated_at` |

フィードバックが空の履歴には行を作らない。後から入力したときに追加する。

## 10. 当日の品切れ

現在の `outOfStock.date` が移行実行日と同じ場合だけ、IDごとに `daily_menu_status` を作る。過去日または日付不明なら移行しない。これにより翌日リセットの現在仕様を維持する。

## 11. 初回移行時の検証

移行完了条件は次のとおり。

- `menu_items` の有効件数が、正規化後の現在メニュー件数と一致する。
- `visits` の件数が、有効な現在履歴件数と一致する。
- `order_items` の件数と合計金額が、端末内履歴と一致する。
- 旧履歴は `legacy` として残り、注文時価格が変わらない。
- 季節・期間限定・休止中の状態が現在メニューと一致する。
- 同じバックアップを2回取り込んでも件数が増えない。

## 12. 今回まだ行わないこと

- Supabaseへの実データ投入
- スマホ内データの削除
- GitHub初期CSVによるスマホ編集内容の上書き
- 未記録注文案の自動確定
- 公開版アプリの保存先変更
