# 手動クラウドバックアップ（v1.16.0）

端末を基準とし、明示的な保存・復元操作のみ行う。従来の同期設計は将来案であり、この版では自動同期・キュー・マージ・競合解決を実装しない。注文ルール、基本メニューCSV、価格データは変更していない。

## 保存形式

専用テーブル `public.hidaka_manual_backups` に、利用者・アプリ・連携店舗ごとの最新1件を保存する。保存ボタンを押すと、前回のクラウドバックアップをその時点の端末データで置き換える。一般の `menu_items`、`visits`、キープ帳のテーブルとは別の保存先。

| 列 | 内容 |
|---|---|
| user_id / app_key / store_id | 所有者・日高オーダー・既存店舗対応。複合主キー |
| backup_id | 保存1回ごとに発行するUUID。保存結果の照合用 |
| payload | 現在の全データバックアップ形式6をそのままJSONBで保持 |
| updated_at | DBが決定する最終バックアップ日時。端末から日時指定不可 |
| menu_count / initial_menu_count / history_count / store_count / stock_count | payloadからDBが計算する件数。表示用 |

payloadは `format`、`schemaVersion`、`exportedAt`、`source`、`data` を持つ。dataには店舗、現在/初期メニュー（ID・価格・タグ・休止・期間・メモ含む）、履歴（当時価格・数量・提案との差・感想含む）、設定、並び順、当日の品切れ、未記録注文、形式/初期メニュー版、適用済みメニュー修正印を含める。追加商品、削除した商品の不在も保持する。全店舗分を含む端末スナップショットであり、店舗ごとの部分同期ではない。

APIキー・ログインセッション・認証リンクは別の保存領域にあり、payloadへ含めない。送信上限8MB、DB保存上限10MB。上限超過時は端末JSONを利用する。

## 読取と手動操作

- 起動: 既存の接続・ログイン確認のみ。バックアップ保存/取得/復元なし。
- クラウド管理を開く、件数確認: メタデータのGETのみ。バックアップと既存連携用データの件数を分けて表示。
- バックアップ: 全データを検証し専用テーブルへ1回のPOST/upsert。失敗時に自動再送しない。通信結果が不明な場合は件数確認を案内する。
- 復元: クラウドの全データをGET → 形式/所有者/日時/件数検証 → 端末との比較画面 → 明示的な上書きボタン。
- 確認画面はDB日時、元端末保存日時、現在/復元後のメニュー・休止・初期メニュー・履歴・最新注文日・店舗・品切れ・未記録注文を表示する。
- キャンセル、壊れたデータ、ログイン利用者変更、確認後の端末変更では上書きしない。別タブの保存変更も検出して中止する。
- 確認済みのスナップショットを復元する。別端末が確認後にクラウドを更新しても、取得し直して未確認データに差し替えない。
- `hidaka-order-before-cloud-restore-v1` に復元前の完全JSONを1件保存する。復元時の端末内安全コピーでありクラウドへの自動保存ではない。容量不足で保存できなければ復元を中止する。
- 端末データの永続保存を成功させてからメモリ/画面を切り替える。以前の日付の品切れは従来どおり当日の対象から外す。
- ログアウトしても端末データは消さない。個人情報を含む予備コピーもこの端末に残る。

## 設定と安全性

1. `supabase/migrations/202609050001_manual_backups.sql` を既存の shochu-keep-ledger に適用。既存の店舗対応・日時トリガーが必要。既存のメニュー/履歴/キープ帳データは変更しない。
2. `config.local.json` の mode を `manual-backup` にする。他の接続先・キー・店舗設定を変更しない。
3. 公開する場合は、GitHub Actionsの `HIDAKA_SUPABASE_PUBLIC_CONFIG` も同じ mode にする。ソースには実キーを保存しない。設定を変えるだけではバックアップは実行されない。
4. キープ帳と同じ利用者でログインし、最初の実データ保存は基準となる端末（スマホ）から行う。

RLSで `auth.uid() = user_id` を必須にし、店舗対応への所有者込み外部キーを使う。未ログイン/他人の行の読み書きは拒否。クライアントはSELECT・限定列のINSERT/UPDATEのみ許可し、DELETEやDB日時/生成件数の指定は不許可。参考: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[列単位の権限](https://supabase.com/docs/guides/database/postgres/column-level-security)、[PostgREST upsert](https://docs.postgrest.org/en/v14/references/api/tables_views.html)。

## 検証

- `node scripts/test-manual-cloud-backup.mjs`: 全項目保存・読取/保存の区別・確認/キャンセル・容量不足・別タブ変更・利用者変更・破損・通信失敗・二重クリック・復元前コピー・認証を含めないこと。
- 既存の注文/履歴/取り込み/タグ更新/公開設定テストも継続。
- `supabase/tests/manual_backups.sql`: 実バックアップがない時だけ、仮データで所有者のinsert/upsert/select、別人のread/update拒否、未ログイン拒否、削除拒否、日時権限を検証し、全てROLLBACK。実バックアップができた後は実行しない。
- ブラウザ上で4画面・戻る・ログイン状態・端末の予備機能・メニュー編集を確認。本人ログインでの最初の実データバックアップ/復元は利用者の確認を受けて行う。

v1.16.0の公開対象。最初の実データバックアップは、基準となるスマホから手動で行う。

2026-09-05: 専用テーブルを実Supabaseへ適用し、上記RLS・upsertテスト成功。仮データはROLLBACK済み（バックアップ0件）。既存メニュー101件・来店6件を維持。

## 変更ファイル

- `index.html` / `styles.css`: 4項目の入口、各画面、復元比較ダイアログ。
- `app.js`: ページ移動、手動操作、比較/確認、復元前の安全コピー、書き出し通知。
- `supabase-connection.js`: 本人確認・専用バックアップのGET/POST・取得結果検証。起動時呼び出しは追加しない。
- `supabase/migrations/202609050001_manual_backups.sql`: 専用保存先・権限・RLS・DB日時/件数。
- `supabase/tests/manual_backups.sql`: ロール別の実DB検証（仮データは残さない）。
- `config.example.json` / ローカル限定の `config.local.json`: 手動バックアップモード。実値はGit管理しない。
- `scripts/build-pages.mjs` / `scripts/test-pages-build.mjs` / `.github/workflows/deploy-pages-extended.yml`: 公開設定検査・回帰テスト追加。公開処理は未実行。
- `scripts/test-manual-cloud-backup.mjs`: アプリ/通信の自動検証。
- `scripts/serve-local.mjs`: 公開資産だけを配信するローカル確認用サーバー。
- `service-worker.js`: キャッシュ版更新。
- `README.md` / `supabase/README.md` / `docs/supabase-sync-design.md` / この文書: 保存仕様・検証結果・従来の自動同期案との区別。
