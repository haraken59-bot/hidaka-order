# Supabase準備

このフォルダーには、確認済みの順にSupabaseへ適用するSQLを置く。

第1・第2段階のテーブル作成SQLと、初回データ（メニュー101件、来店6件、注文明細52件）は、2026-09-02に `shochu-keep-ledger` へ適用・検証済み。

2026-09-05に `202609050001_manual_backups.sql` を同プロジェクトへ適用。手動バックアップ専用テーブルを追加し、既存データは変更していない。本人insert/upsert/select、他人のread/update拒否、未ログイン拒否、削除拒否、日時権限をトランザクション内の仮データで検証し、ROLLBACK後のバックアップ0件・既存メニュー101件・来店6件を確認した。実バックアップの保存は利用者の手動操作で行う。アプリ本体はまだ未公開。

## 構成

1. `migrations/202609010001_core_tables.sql`
   - 既存 `stores` と日高の `hidaka-001` の対応
   - メニューマスタ
   - 店舗別設定
   - 上記3テーブルのRLS
2. `migrations/202609010002_order_history_tables.sql`
   - 当日の品切れ
   - 来店
   - AI提案と提案商品
   - 実際の注文明細
   - 満足度・感想
   - 上記6テーブルのRLS
3. `scripts/prepare-supabase-import.mjs`
   - 完全バックアップを、選択済みの既存Supabase店舗へ結び付けた取り込み用JSONへ変換
   - 実データは `private-import/` に出力し、GitHubから除外
   - 件数と変換内容をアップロード前に確認

実データの登録は、変換結果を確認してから別工程で行う。
