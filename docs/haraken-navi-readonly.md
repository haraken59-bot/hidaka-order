# ハラケンナビ読み取り連携

## 目的

日高オーダーの内部保存形式をハラケンナビ側へ直接持ち込まず、本人のデータだけを少数回で取得するための読み取り専用インターフェースです。今回、ハラケンナビ本体からの接続や書き込みは行いません。

## 取得口

- Supabase RPC: `public.get_hidaka_ai_context(text, text, integer)`
- 日高オーダー側の確認関数: `window.HidakaSupabase.readHarakenNaviContext({ recentLimit: 5 })`
- 認証: 日高オーダー・焼酎キープ帖と同じSupabase Authセッション
- 既定引数:
  - `p_app_key`: `hidaka-order`
  - `p_legacy_store_id`: `hidaka-001`
  - `p_recent_limit`: `5`（1〜20）

RPCは`security invoker`で動作し、`auth.uid()`と`app_store_links`で本人の店舗を特定します。未ログインの`anon`には実行権限を与えず、`authenticated`だけに実行権限を付与します。関数本体には追加・更新・削除処理がありません。

## 返却データ

```json
{
  "schema_version": 1,
  "generated_at": "2026-09-22T02:00:00Z",
  "data_source": "manual_backup",
  "snapshot_at": "2026-09-21T20:00:00Z",
  "store": {
    "id": "Supabase店舗UUID",
    "legacy_id": "hidaka-001",
    "name": "やきとり日高",
    "area": null,
    "memo": null,
    "is_current": true
  },
  "current_menu": [
    {
      "id": "base-001",
      "name": "ししとう串",
      "category": "skewer",
      "price": 180,
      "tags": ["野菜"],
      "is_available": true,
      "offering_type": "regular",
      "available_from": null,
      "available_until": null,
      "is_sold_out": false,
      "is_orderable": true
    }
  ],
  "recent_orders": [
    {
      "id": "history-...",
      "visit_id": "visit-...",
      "visited_at": "2026-09-20T19:00:00+09:00",
      "total_amount": 2992,
      "starting_drink": "生ビール中ジョッキ",
      "items": [],
      "drinks": [],
      "skewers": [],
      "snacks": [],
      "manual_items": [],
      "changed_items": [],
      "feedback": {
        "satisfaction": 5,
        "repeat_preference": "again",
        "amount_feeling": "just",
        "price_feeling": "fair",
        "comment": null
      }
    }
  ],
  "order_summary": {
    "frequent_recent_items": [],
    "not_recently_ordered": [],
    "recent_three_skewers": [],
    "order_frequency": [],
    "high_satisfaction_orders": [],
    "low_satisfaction_orders": []
  },
  "bottle_status": {
    "has_keep": true,
    "fixed_charge": 220,
    "bottles": [
      {
        "id": "ボトルUUID",
        "brand": "黒霧島",
        "remaining_percent": 45,
        "started_on": "2026-09-03"
      }
    ]
  },
  "limitations": [
    "端末内だけの未バックアップ変更は含みません",
    "メニュー・履歴・品切れは最終手動バックアップ時点です",
    "このRPCは読み取り専用です"
  ]
}
```

## データの優先順位と境界

### AIが参照できるもの

1. `hidaka_manual_backups`に手動保存済みのデータ
   - 現在メニュー、価格、タグ、休止状態、提供期間
   - 注文履歴、手動追加、提案からの変更、変更理由、満足度
   - バックアップ日の当日品切れ
2. 手動バックアップがない場合の正規化テーブル
   - `menu_items`、`daily_menu_status`
   - `visits`、`order_items`、`recommendation_items`、`visit_feedback`
3. 焼酎キープ帖の現在値
   - `stores`、`bottles`

### 現在はAI参照対象外のもの

- 最後の手動クラウドバックアップ後に端末で変更したメニュー
- 最後の手動クラウドバックアップ後に端末へ記録した注文・感想
- 最後の手動クラウドバックアップ後に端末で付けた当日の品切れ
- 端末内の未記録注文案

これらを勝手にクラウドへ移行する処理や、自動同期は追加していません。最新状態をAIへ渡すには、利用者が日高オーダーの「クラウドへバックアップ」を実行します。

## 読み取り専用の確認

- RPC本体は`stable`、`security invoker`
- `auth.uid()`と本人の`app_store_links`を必須化
- `anon`と`public`の実行権限を削除
- `authenticated`へ実行権限だけを付与
- RPC本体に`INSERT`、`UPDATE`、`DELETE`なし
- 日高オーダー側の取得関数もRPCの読取呼び出しだけ
- 焼酎残量更新RPCは呼ばない

## Supabaseへ反映する手順

1. `supabase/migrations/202609220001_haraken_navi_read_context.sql`をSupabase SQL Editorで確認する。
2. 対象プロジェクトが焼酎キープ帖と同じプロジェクトであることを確認する。
3. SQL全体を1回実行する。
4. 同じ利用者でログインした日高オーダーから、`readHarakenNaviContext({ recentLimit: 5 })`の応答を確認する。

## 次の段階で必要な情報

- Supabase Project URL
- ブラウザ用Publishable key
- RPC名 `get_hidaka_ai_context`
- 引数名と既定値
- 出力`schema_version`（現在は1）
- 日高オーダー・焼酎キープ帖と同じ利用者でログインする方法
- Supabase店舗UUIDと`hidaka-001`の対応
- 利用前に最新の手動バックアップが必要であること

ハラケンナビ本体からの接続、書き込み、自動注文、自動同期は次工程です。
