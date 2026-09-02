# 日高オーダー 初回データ移行の準備

- 作成日: 2026-09-01
- 状態: 共有店舗ID対応の変換・確認まで。実データのアップロードは未実施

## 1. 安全方針

- スマホから保存した完全バックアップJSONを移行元にする。
- 元のバックアップは変更・削除しない。
- 個人の注文履歴を含む変換結果は `supabase/private-import/` に置く。
- `supabase/private-import/` は `.gitignore` で除外し、GitHubへ送らない。
- 変換データには `user_id` を書き込まず、将来のアップロード時にログイン中の本人へ結び付ける。
- 旧店舗IDは、GitHub管理外の `store-selection.json` を使って既存Supabase店舗へ結び付ける。
- 未記録の注文案は注文履歴にせず、端末内へ残す。

## 2. 変換ツール

`scripts/prepare-supabase-import.mjs` を使用する。

```powershell
node scripts/prepare-supabase-import.mjs "C:\Users\User\Downloads\日高オーダー_全データ_2026-08-31 (2).json"
```

出力先:

- `supabase/private-import/supabase-import.json`
- `supabase/private-import/import-summary.json`

店舗の対応情報は、同じ出力先にある `store-selection.json` から読み込む。3番目の引数で別ファイルを指定することもできる。

## 3. 登録SQLの作成

確認済みJSONから、SQL Editor用の登録SQLを作成する。

```powershell
node scripts/create-supabase-import-sql.mjs
```

出力先は `supabase/private-import/supabase-import.sql`。注文履歴を含むためGitHubには登録しない。

このSQLは次を満たす。

- 選択済み店舗がSupabaseに存在するか実行前に確認する。
- 既存店舗の `user_id` を自動的に使用する。
- 9テーブルを外部キーの順番どおりに登録する。
- 途中で失敗した場合は全体を取り消す。
- 同じデータを再実行した場合は主キーを基準に更新する。

## 4. 変換内容

| 元データ | 変換先 |
|---|---|
| 旧店舗IDと既存Supabase店舗の対応 | `app_store_links` |
| 現在のメニュー | `menu_items` |
| 設定・固定ルール | `store_settings` |
| 当日分だけの品切れ | `daily_menu_status` |
| 注文履歴 | `visits` |
| AIの変更前提案 | `recommendation_runs`、`recommendation_items` |
| 実際の注文 | `order_items` |
| 満足度・感想 | `visit_feedback` |

`initialMenu` はGitHubの初期CSVと役割が重なるため、Supabaseへ二重登録しない。

## 5. 旧バックアップの補完

バックアップ形式1〜6に対応する。旧形式に項目がない場合は次のように扱う。

- 店舗IDなし: `hidaka-001`
- 店舗名なし: `やきとり日高`
- 来店IDなし: 注文履歴IDから安定IDを生成
- 注文明細IDなし: 履歴IDと注文順から生成
- 数量なし: 1
- 注文順なし: 配列順
- 注文元なし: `legacy`
- 状況・感想なし: 推測せず空欄
- 注文時価格あり: 現在価格で上書きせず保存
- `割代（焼酎キープ）`: 通常メニューへ結び付けず、固定料金の注文明細として保存

## 6. 重複防止

- 既存Supabase店舗は新規作成せず、選択済み店舗IDを利用する。
- メニュー・履歴・明細IDを維持する。
- IDがない旧データには、内容から毎回同じIDを生成する。
- 将来のアップロードは `upsert` を使う。
- 同じバックアップを再変換・再送しても件数を増やさない。

## 7. アップロード前の確認

次の件数を端末のバックアップ表示と照合する。

- `menu_items`
- `visits`
- `order_items`
- `visit_feedback`
- 未記録注文の有無
- 当日品切れの対象件数

さらに、履歴ごとの商品数と合計金額が変換前後で一致することを確認する。

## 8. アップロード時の順番

2026-09-02の初回登録では、既存店舗の所有者を確認したうえで次の順に `upsert` した。

1. `app_store_links`
2. `menu_items`
3. `store_settings`
4. `daily_menu_status`
5. `visits`
6. `recommendation_runs`
7. `recommendation_items`
8. `order_items`
9. `visit_feedback`

途中で失敗した場合は端末データを削除せず、失敗したテーブルから再実行する。

初回登録結果は、メニュー101件、来店6件、注文明細52件。履歴ごとの合計金額に不一致はなかった。

## 9. 今回まだ行わないこと

- 本人アカウントの作成
- スマホ内データの削除
- 変換後JSONのGitHub登録
- 公開版の変更
