# 注文履歴のクラウド直接保存（v1.20.0）

注文記録・感想保存の明示操作時だけ、端末保存後に `save_hidaka_order_history` を呼びます。未ログイン・通信失敗・SQL未適用では端末履歴を保持し、失敗を表示します。自動再送や起動時のアップロードはありません。感想保存時は同じ履歴IDを使って再度保存できるため、初回失敗後の明示的な再試行にもなります。

## DB設定

Supabase SQL Editorで次の順番に実行してください。

1. `supabase/migrations/202610010001_direct_order_history.sql`
2. `supabase/migrations/202610010002_direct_order_read_context.sql`
3. `supabase/tests/direct_order_history.sql`（テスト書込みはROLLBACK）

既存 `visits` に nullable の `order_snapshot jsonb` を追加。新規テーブル・RLSの変更はありません。保存RPCは SECURITY INVOKER と既存の本人限定RLSを使用し、auth.uid()とapp_store_linksから利用者・店舗を決定します。stores/bottles/store_visits/remaining_updates/brand_labelsは変更しません。

## 保存形式

`visits` のユーザーID・来店ID・端末履歴ID・店舗ID・来店日時・記録日時・会計と、`order_snapshot` を保存します。クラウド未登録の商品も商品名・単価・区分のスナップショットで扱えるため、メニューマスタの同期は不要です。order_items等への二重書込みはしません。

スナップショットは `id, visit_id, user_id, store_id, store_name, visited_at, recorded_at, context, proposed_items, items, removed_items, included_featured_dish, starting_drink, feedback` を含みます。商品ごとにID・名前・区分・数量・注文時価格・順番・source・変更理由・元提案を保持します。DB側で合計・商品数・串本数・飲み物・串・つまみ・手動追加・変更商品を実注文から算出します。商品数に割代は含めません。

自動提案の直後に提案一覧を複製し、手動調整から独立して保持します。組み直した場合は新たな提案を基準とします。旧履歴の元提案がない場合はnullとして扱い、推測で補いません。

`(user_id, order_history_id)` の既存一意制約で重複を防ぎます。再送時に確定注文は上書きせず、更新日時の新しい感想だけ更新します。クラウド保存済み履歴は端末に保存先利用者IDも保持し、別アカウントでの再送を拒否します。双方向競合解決は対象外です。

## ハラケンナビ参照

既存 `get_hidaka_ai_context` は同じ履歴IDについて直接保存を優先し、手動バックアップ由来の履歴と重複排除して最近の履歴を返します。注文頻度や満足度の集約も統合後の履歴を使用します。外した商品、追加商品、提案と実注文、実際の串数・会計、状況、満足度を参照可能です。メニュー・価格・提供状態は手動バックアップ時点のままです。

焼酎の最新状況は既存読取RPCのbottle_statusを参照し、残量記録は既存処理を維持します。注文ごとの焼酎残量スナップショットは今回追加していません。古い履歴の一括アップロード、ナビ本体接続、メニュー同期、自動再送は未実装です。

## 確認状況

ローカルのモック通信・データ変換・既存関連テストを実行。2026-10-02に利用者が実Supabaseで2本のSQLを適用し、トランザクションを取り消す確認テストの成功を報告しました。ローカル画面でも「クラウド保存済み」を確認済みです。保存結果は結果画面と履歴一覧に表示します。
