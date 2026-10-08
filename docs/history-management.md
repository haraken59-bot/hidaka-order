# 履歴管理 v1.21.0（実DB・実機確認完了・公開済み）

## 適用順

進捗（2026-10-08）：利用者が手順1・2の適用成功と手順3の成功・ROLLBACKメッセージ、手順4の実機確認成功を報告。ボタン配置調整後、利用者承認を受けて公開完了。

1. Supabase SQL Editorで `supabase/migrations/202610080001_history_management.sql` を実行。
2. `supabase/migrations/202610080002_history_management_read_context.sql` を実行。
3. `supabase/tests/history_management.sql` を実行し、`History management tests passed; all test writes rolled back` を確認。
4. ローカルで本人ログインし、利用者が選んだテスト履歴で編集・削除・一括送信・失敗時再送を確認。その後公開。

1/2はDB定義変更。既存行を一括更新・削除しない。3は検証用データとバックアップの一時変更をトランザクション内で行い、最後に全てROLLBACKする。エラーになった場合もCOMMITしない。
指定された2026-10-07のテストIDは利用者の実DB確認で不在。削除SQLは発行していない。

## 保存仕様

- 正本は端末。明示操作時だけ送信。編集・削除は端末保存成功後にRPCを呼ぶ。
- `cloudSave.state`: saved / pending / failed。`pendingAction`: edit / delete / import / save。失敗しても操作を保持し、手動再送する。
- 端末削除は `deletedAt`。通常表示・最近の注文判定から除外し、バックアップには再送用の削除マーカーを保持する。
- `visits.order_snapshot` が従来どおり直接保存履歴の参照元。編集時は `total_amount` と実注文スナップショット、order_itemsの有効明細、visit_feedbackの満足度・感想を更新する。既存提案は変更しない。
- `visits` と `order_items` の既存deleted_atを利用し、recommendation_runs / recommendation_items / visit_feedbackに同列を追加。削除操作では同一利用者・来店の関連行を論理削除する。焼酎残量履歴には触れない。
- `get_hidaka_ai_context` は削除済み来店を除外し、同じIDの古いバックアップも除外してから集計する。今後SQL集計を増やす場合もdeleted_atがnullの来店に限定する。
- `list_hidaka_order_history` は本人・店舗の指定IDだけ返す。100件ずつ照合し、一括送信は未登録のみ。保存は既存 `(user_id, order_history_id)` UNIQUEを利用。削除済みIDの再作成は拒否する。
- 古い履歴の不明な価格・提案はnullのまま。既知の会計合計は保持。明細編集時は注文時単価を入力し、明細合計と会計合計を一致させる。
- クラウドだけで削除済みの履歴は再送対象外。端末の内容を勝手に消す双方向同期はしない。
- 正常な既存RPCの認証/RLSを継承（SECURITY INVOKER）。新規認証、サービスキー、バックグラウンド同期なし。

## 変更ファイル

- app.js、index.html、styles.css、supabase-connection.js、service-worker.js
- supabase/migrations/202610080001_history_management.sql
- supabase/migrations/202610080002_history_management_read_context.sql
- supabase/tests/history_management.sql
- scripts/test-history-management.mjs、scripts/test-order-cloud-transport.mjs
- scripts/check-history-sql.mjs（一時PGlite環境指定時だけ使う。アプリの依存関係追加なし）
- .github/workflows/deploy-pages-extended.yml（公開前テスト追加）
- HIDAKA_STATUS.md、CHANGELOG.md、この文書

## 検証結果（2026-10-08）

- JSテスト12本成功。合計・元提案保持・除外数・古い不明情報・削除マーカー・取消・所有者違い・ID不一致・分割一覧取得・失敗時保持を確認。
- 分離PostgreSQLで既存direct_order_history.sqlと新history_management.sql成功。編集の再実行、行重複防止、関連行の論理削除、他履歴保持、バックアップからの復活防止、本人分離、匿名拒否を確認。実Supabaseへの適用ではない。
- 実ブラウザで数量変更と除外の即時計算、保存せず閉じた後の既存金額保持を確認。390px幅で編集欄clientWidth=scrollWidth=322。
- 利用者の実機確認：編集・削除・他履歴保持・一括送信（未送信1件）・重複防止・再送成功。再送後も編集内容保持、保存済み表示、再送対象なし。
- 最終UI調整後JSテスト12本成功。360px・390px・1024pxで操作欄の横はみ出しなし。感想を上段、編集・削除を下段に分離し、各ボタン高さ48px。今回のブラウザ確認で保存・削除は確定していない。
- v1.21.0公開済み。Actions 37764043408成功、公開画面の版表示と配信app.jsの一致を確認（2026-10-08）。

実DB適用・実機確認・公開が済めば、今回範囲の日高側の履歴整備は区切りにできる。ハラケンナビ本体への接続は今回実施しない。
