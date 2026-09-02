# 日高オーダー Supabaseセキュリティ設計

- 設計版: 1
- 作成日: 2026-09-01
- 対象: GitHub Pages公開版 + Supabase
- 状態: 設計のみ。認証設定・SQL実行・アプリ接続は未実施

## 1. 守る対象

次のデータを本人以外がSupabaseから読んだり変更したりできない状態にする。

- メニューと価格
- 来店日時、注文内容、会計金額
- 注文時の希望・気分
- AI提案と実際の注文の差
- 満足度、次回意向、コメント
- 当日の品切れ
- 将来の焼酎キープ情報

GitHub PagesのHTML・JavaScript・初期CSVは公開情報として扱う。個人の履歴やスマホで編集した現在データはGitHubへ置かない。

## 2. 採用する認証方式

初期版はSupabase Authのメール・ワンタイムコード（OTP）を採用する。

理由:

- パスワードをアプリやGitHubに保存しない。
- スマホのインストール済みPWAで、届いた6桁コードを同じ画面へ入力できる。
- メール内リンクが別のChrome画面で開く問題を避けやすい。
- 将来ハラケンAIや焼酎キープ管理も同じ利用者IDを使える。

初期設定は本人専用とする。

1. Supabase管理画面で本人の利用者を1人だけ作成または招待する。
2. 一般利用者の新規登録を無効にする。
3. アプリからOTPを送るときは、新しい利用者を自動作成しない設定にする。
4. ログイン済みのときだけSupabase同期を有効にする。

将来、家族など別利用者を追加するときは、管理者が個別に招待する。一般公開の自由登録には変更しない。

## 3. 認証URL

Supabase AuthのURL設定は次を使用する。

| 種類 | URL |
|---|---|
| 本番Site URL | `https://haraken59-bot.github.io/hidaka-order/` |
| 本番Redirect URL | `https://haraken59-bot.github.io/hidaka-order/**` |
| ローカル確認 | 固定ポートを決めて `http://127.0.0.1:8133/**` |

本番URLを既定にし、任意の外部URLへ認証後リダイレクトできる設定にはしない。ローカル確認URLは必要な期間だけ登録する。

## 4. APIキーの扱い

### 4.1 ブラウザで使用するもの

- Project URL
- SupabaseのPublishable key（旧形式なら `anon` key）

Publishable keyはブラウザ用であり、利用者のJWTとRLSを組み合わせて使う。ただし利用者の希望どおり、ソースコードへ直接書かない。

GitHub Actionsの環境変数またはシークレットから、公開処理時だけ実行時設定ファイルを生成する。生成物はブラウザから確認できるため、Publishable keyだけを入れ、秘密情報は絶対に入れない。

### 4.2 使用しないもの

- Secret key
- `service_role` key
- データベースのパスワード
- Supabase管理用アクセストークン

これらはGitHub Pages、JavaScript、設定ファイル、URL、バックアップJSON、ブラウザ保存領域へ置かない。現在の日高オーダーのブラウザ機能には必要ない。

## 5. GitHubでの管理

接続実装前に次を行う。

1. `.env`、`.env.*`、`config.local.js`、Supabaseローカル一時ファイルを `.gitignore` へ追加する。
2. 値を含まない `.env.example` または `config.example.js` だけをGitHubへ保存する。
3. 公開用Publishable keyはGitHub Actionsの設定から公開成果物へ注入する。
4. Secret keyや `service_role` はGitHub Actionsにも登録しない。
5. コミット前に秘密情報の文字列検査を行う。

静的サイトでは、ブラウザ用キーを完全に隠すことはできない。安全性はキーを隠すことではなく、ログインとRLSで本人の行だけを許可することによって確保する。

## 6. データベース権限

すべての公開テーブルで次を実施する。

1. RLSを有効にする。
2. `anon` から `select / insert / update / delete` 権限を外す。
3. `authenticated` にはアプリで必要な操作だけを許可する。
4. 操作ごとにRLSポリシーを作る。
5. `owner_id` の既定値をログイン中の `auth.uid()` にする。

ポリシーの基本条件:

```sql
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
```

追加・更新には同じ条件を `with check` にも指定し、別利用者の `owner_id` を書き込めないようにする。

### 操作別ルール

| 操作 | 条件 |
|---|---|
| SELECT | 自分の `owner_id` の行だけ |
| INSERT | 新しい行の `owner_id` が自分と一致 |
| UPDATE | 元の行と更新後の行がどちらも自分のもの |
| DELETE | 自分の行だけ。通常は物理削除せず `deleted_at` を更新 |

## 7. テーブル間の所有者整合性

現在の `hidaka-001` や `base-001` は変更しない。その代わり、データベース上の主キー・外部キーには `owner_id` を含める。

例:

```text
stores       主キー (owner_id, id)
menu_items   主キー (owner_id, id)
             外部キー (owner_id, store_id) → stores(owner_id, id)
visits       主キー (owner_id, id)
order_items  主キー (owner_id, id)
             外部キー (owner_id, visit_id) → visits(owner_id, id)
```

これにより、同じ `hidaka-001` を別利用者が使える一方、他人の店舗や来店に自分のデータを誤接続できない。

`recommendation_items`、`visit_feedback`、`daily_menu_status` も、親テーブルへの外部キーに `owner_id` を含める。

## 8. ビューとデータベース関数

- 初期版では公開ビューを作らない。
- 将来ビューを作る場合は、呼び出した利用者のRLSが有効になる安全な方式を使用する。
- 集計関数や注文一括保存関数を作る場合も、関数内で `auth.uid()` と所有者を確認する。
- 管理者権限で動く関数は原則作らない。
- やむを得ず権限昇格関数を作る場合は、対象を限定し、固定した安全な `search_path` と明示的な権限を設定する。

## 9. 端末内データの注意点

RLSが守るのはSupabase上のデータであり、現在の `localStorage` はスマホを操作できる人からは見える可能性がある。

初期方針:

- 自分のスマホとブラウザプロファイルだけで使用する。
- スマホの画面ロックを有効にする。
- ログアウトしても未同期データを失わないよう、端末内データは自動削除しない。
- 「この端末のデータも削除してログアウト」を別操作として将来追加する。
- バックアップJSONには認証セッション、OTP、APIキーを含めない。

共有端末での利用や端末内暗号化は初期範囲外とする。

## 10. ブラウザ側の保護

- メニュー名、メモ、コメントなどはHTMLへ表示するとき必ずエスケープする。
- Supabaseから取得した値を、そのまま `innerHTML` へ入れない。
- 外部スクリプトを増やさず、Supabaseクライアントのバージョンを固定する。
- 接続実装前にContent Security Policy（CSP）を追加し、接続先を自分のSupabaseプロジェクトへ限定する。
- 認証トークンや利用者データをコンソールへ出さない。
- URLのクエリ文字列へOTP、JWT、キー、注文内容を入れない。
- Service Workerは認証APIの応答をキャッシュしない。現在と同じく自サイトのGET資産だけを対象にする。

## 11. ハラケンAI・焼酎キープ管理との連携

- 同じSupabase Authの `auth.uid()` を共通の所有者IDにする。
- 日高オーダーが他アプリの全データを直接読める権限は与えない。
- 必要なテーブル・列だけに個別のRLSと権限を設定する。
- ハラケンAIがサーバー側で処理する場合も、利用者のJWTまたは利用者を限定したサーバー処理を使う。
- Secret keyで利用者を区別せず全データを読む設計にしない。

## 12. セキュリティ確認項目

接続実装後、公開前に最低限次をテストする。

1. 未ログインでは全テーブルを読めない。
2. 未ログインでは追加・変更・削除できない。
3. 利用者Aは利用者Bの行を読めない。
4. 利用者Aの行から利用者Bの親データへ関連付けできない。
5. `owner_id` を別利用者へ書き換えようとすると失敗する。
6. 削除済みメニューが別端末でも候補に出ない。
7. 公開サイトとGitHub履歴にSecret key、`service_role`、パスワードがない。
8. 完全バックアップにJWT、OTP、APIキーがない。
9. ログアウト後はSupabaseへアクセスできない。
10. オフライン中の注文は端末へ残り、再ログイン後に本人の領域だけへ同期される。

## 13. 今回確定する内容

1. 認証は本人専用のメールOTPから始める。
2. 自由な新規登録は無効にする。
3. ブラウザにはPublishable keyだけを使う。
4. 利用者の希望どおり、Publishable keyもソースコードへ直接書かない。
5. Secret keyと `service_role` は現在のアプリでは使用しない。
6. 全テーブルを `authenticated + owner_id + RLS` で保護する。
7. 外部キーにも `owner_id` を含める。
8. ローカル保存は維持し、端末保護の責任範囲を明示する。

## 14. 参考にした公式資料

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/auth/redirect-urls

## 15. 今回まだ行わないこと

- Supabaseプロジェクトの作成
- 本人メールアドレスの登録
- RLS用SQLの実行
- GitHub Actionsへの変数登録
- `.env`、認証画面、同期処理の追加
- 現在データのアップロード
- 公開版の更新
