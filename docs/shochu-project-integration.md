# shochu-keep-ledger 共用設計

- 確認日: 2026-09-02
- 対象Supabase: `shochu-keep-ledger`
- 状態: SQL調整済み・未実行

## 1. 確認した既存構成

既存のpublicスキーマには次のテーブルがある。

- `stores`
- `bottles`
- `store_visits`
- `remaining_updates`
- `brand_labels`

既存テーブルはすべて `user_id` とSupabase Authを使い、`auth.uid() = user_id` のRLSで本人のデータだけに制限されている。

## 2. 既存storesの共用

日高オーダー用に別の `stores` を作らず、焼酎管理側の既存テーブルを共用する。

既存 `stores` の主な項目:

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | uuid | Supabase上の店舗ID |
| `user_id` | uuid | 利用者ID |
| `name` | text | 店名 |
| `area` | text | エリア |
| `notes` | text | メモ |
| `latitude` / `longitude` | double precision | 位置情報 |
| `created_at` / `updated_at` | timestamptz | 作成・更新日時 |

現在アプリの店舗ID `hidaka-001` は削除せず、新しい `app_store_links` で既存店舗UUIDへ対応付ける。

```text
日高オーダー hidaka-001
  ↓ app_store_links
shochu-keep-ledger stores.id（店舗A）
```

## 3. 選択した店舗

同名の「やきとり日高」が2件あったため、ユーザー確認のうえ、ボトル記録49件・来店記録55件が関連する店舗Aを共用対象にした。

実際の店舗UUIDはGitHubへ保存せず、`supabase/private-import/store-selection.json` に保存している。

## 4. SQLの変更

当初案から次を変更した。

- `stores` の新規作成を中止
- 新規テーブルの所有者列を `owner_id` から既存と同じ `user_id` へ統一
- 新規テーブルの `store_id` を text から既存店舗のuuidへ変更
- `app_store_links` を追加
- 既存 `stores` に `user_id + id` の一意制約だけを追加
- 既存店舗の行、焼酎ボトル、来店記録、RLSポリシーは変更しない

## 5. 実行時に新規作成するテーブル

第1SQL:

- `app_store_links`
- `menu_items`
- `store_settings`

第2SQL:

- `daily_menu_status`
- `visits`
- `recommendation_runs`
- `recommendation_items`
- `order_items`
- `visit_feedback`

既存テーブル名との重複はない。

## 6. まだ行わないこと

- SQLの実行
- 店舗Aへの対応行の登録
- メニュー・履歴のアップロード
- 焼酎管理アプリの変更
- 日高オーダー公開版の変更
