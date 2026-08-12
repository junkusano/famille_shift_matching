# Codex Project Map

## 1. アプリの目的

コードから確認できた範囲では、このアプリは「ファミーユ・ヘルパーサービス愛知」の業務支援・人材管理・シフト管理・訪問介護関連の業務をまとめた Next.js アプリです。

確認できた主な用途:
- 事前登録フォーム（エントリー）: スタッフ候補者の登録、本人確認、資格証明のアップロード
- ポータル画面: ユーザー向けの個人情報確認、給与確認、研修・評価、シフト確認、申請・書類管理
- 管理者向けポータル: エントリー一覧、組織情報、シフト管理、利用者情報、RPA/通知/監査ログなどの運用業務
- シフト・勤務管理: シフト作成、希望、変更、承認、実績確認、訪問記録関連
- LINE WORKS 連携による認証・通知・リマインド
- 外部連携を含むデータ同期: Google Calendar、Google Drive、LINE WORKS、OpenAI、Twilio など

このアプリは「採用・登録」から「勤務・評価・連携・業務運用」までを一つの Web システムで受け持つ構成であると読み取れます。

---

## 2. 主要ディレクトリ

### src/app
- App Router ベースの画面と API Route が集まる場所
- 例:
  - `src/app/page.tsx`: 公開トップページ
  - `src/app/login/page.tsx`: ログイン
  - `src/app/portal/page.tsx`: ポータルホーム
  - `src/app/portal/*`: 管理・ユーザー向け各機能
  - `src/app/api/*`: API Route 群

### src/components
- UI コンポーネント、ページ別UI、共通部品
- 代表例:
  - `DocUploader.tsx`
  - `Footer.tsx`
  - `OrgIconManager.tsx`
  - `PostSubmitMessage.tsx`
  - `AlertBar.tsx`
  - `portal/` 配下のポータル専用UI
  - `shift/`, `roster/`, `assessment/` 配下の機能別UI

### src/lib
- ビジネスロジック、外部 API クライアント、Supabase 操作用クライアント、ヘルパー関数
- 代表例:
  - `lib/supabaseClient.ts`: ブラウザ側 Supabase クライアント
  - `lib/supabase/service.ts`: サーバー側 Service Role クライアント
  - `lib/getAccessToken.ts`: LINE WORKS アクセストークン取得
  - `lib/lineworks/*`: LINE WORKS 連携
  - `lib/shift/*`: シフト関連判定
  - `lib/alert/*`: 通知・アラート処理
  - `lib/email.ts`, `lib/sms.ts` など

### src/context
- React Context による権限状態管理
- `RoleContext.tsx` が `system_role` を取得し、`useRoleContext` / `useUserRole` を提供

### src/types
- `database.types.ts` は `supabase gen types typescript` によって生成された型定義
- 機能別の用意された型定義もあり、シフト・利用者・申請などの型が存在

### supabase/
- Supabase のマイグレーションや設定を保管
- `database.types.ts` は生成物としてルート直下に存在

### public/
- 画像・ロゴ・動画などの静的ファイル
- 例: `hero.jpg`, `myfamille_logo.png`, `shifco_20250809.mp4`

---

## 3. 主要ページと Component

以下はコードから確認できた代表的な画面です。

### 公開系
- `src/app/page.tsx`
  - トップページ
  - ログイン状態の確認、ログアウト、ポータルへの導線
  - 会社紹介、求人情報リンク、サービス紹介

- `src/app/login/page.tsx`
  - メール/パスワードログイン
  - LINE WORKS 2FA リクエスト・確認
  - Google / Facebook OAuth ログイン
  - パスワード再招待

- `src/app/signup/complete/page.tsx`
  - OAuth 認証完了後の登録完了処理を想定

- `src/app/entry/page.tsx`
  - エントリーフォーム
  - 郵便番号から住所補完、資格証明のファイルアップロード、Supabase 登録

### ポータル系
- `src/app/portal/page.tsx`
  - ポータルホーム
  - `users` と `form_entries` から本人情報、資格情報、給与サマリーを読んで表示

- `src/app/portal/layout.tsx`
  - 左ナビゲーション、ログアウト、ユーザー情報表示
  - `useRoleContext` で管理者/マネージャー/一般のメニュー表示切り替え

- `src/app/portal/shift/page.tsx`
  - シフトと訪問記録の主要画面

- `src/app/portal/roster/monthly/page.tsx`
  - 月次ロスター画面

- `src/app/portal/roster/weekly/page.tsx`
  - 週次ロスター画面

- `src/app/portal/entry-list/page.tsx`
  - エントリー一覧
  - `system_role` に基づく閲覧制御を想定

- `src/app/portal/kaipoke-info/page.tsx`
  - 利用者情報一覧

- `src/app/portal/cs_docs/page.tsx`
  - 利用者書類管理

- `src/app/portal/training-goals/page.tsx`
  - 目標/研修/評価画面

- `src/app/portal/user_salary_monthly/page.tsx`
  - 給与明細

- `src/app/portal/wf-seisan-shinsei/page.tsx`
  - 清算関連申請

- `src/app/portal/user_advance_payment_applications/page.tsx`
  - 日払い申請フォーム

### 共通 Component
- `src/components/RoleProvider.tsx`
  - `RoleContext` をアプリ全体へ提供

- `src/components/DocUploader.tsx`
  - ファイルアップロード UI とメタデータ処理

- `src/components/AlertBar.tsx`
  - 通知バー

- `src/components/PostSubmitMessage.tsx`
  - 提出完了メッセージ表示

- `src/components/portal/PerformanceScoreCard.tsx`
  - 実績スコア表示カード

---

## 4. API / Lib / Supabase のデータフロー

### 4-1. 認証・セッション
- クライアント側の主要 Supabase 接続先:
  - `src/lib/supabaseClient.ts`
  - `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を利用して `createClient` を生成
- サーバー側の管理用クライアント:
  - `src/lib/supabase/service.ts`
  - `SUPABASE_SERVICE_ROLE_KEY` を用いる
- 認証状態の確認は多くの画面で `supabase.auth.getUser()` または `supabase.auth.getSession()` を使っている
- `src/context/RoleContext.tsx` ではユーザーの `auth_user_id` を使って `users` テーブルから `system_role` を取得し、グローバルに権限を持たせる構成

### 4-2. 画面からのデータ取得フロー
例として、ポータルホームでは次のような流れが確認できる:
1. `supabase.auth.getUser()` で現在の認証ユーザーを取得
2. `form_entries` から `auth_uid` 一致のレコードを読み出す
3. `users` から `auth_user_id` と対応する `user_id` などを取得
4. 必要に応じて `fetch('/api/portal/salary-summary?...')` を呼んでサマリーを取得
5. 表示用の state に格納して UI に描画

### 4-3. API Route の役割
`src/app/api` 配下には、業務処理用 API が数多く存在する:
- 認証関連:
  - `/api/auth/lineworks-2fa/request`
  - `/api/auth/lineworks-2fa/verify`
  - `/api/auth/reset-password-reinvite`
- 申請・通知・同期:
  - `/api/lineworks/*`
  - `/api/cron/*`
  - `/api/portal/*`
  - `/api/shifts/*`
  - `/api/upload`
- 外部連携:
  - `/api/google-calendar/*`
  - `/api/expense-reimbursement/*`
  - `/api/sms/*`
  - `/api/faximo/*`

### 4-4. Lib と API の関係
- `src/lib` の各モジュールが外部 API や Supabase 通信をラップしている
- API Route はそのラッパーを呼び出して HTTP リクエストを処理する構成が多い
- 例:
  - `src/app/api/auth/lineworks-2fa/request/route.ts` で `supabaseAdmin` と `getAccessToken()`, `sendLWBotMessage()` を組み合わせている
  - `src/lib/lineworks/sendLWBotMessage.ts` が LINE WORKS の Bot API を呼んでいる

### 4-5. Supabase とのデータフローの特徴
- 画面側は主に `supabase` (anon client) を使って行う
- サーバー側・バックグラウンド処理は `supabaseAdmin` (service role) を使う
- その分離により、公開画面から管理者権限の強い操作が直接行われにくい構造になっている
- `database.types.ts` には `Tables` と `Views` が定義されており、データセットが大量に存在する

---

## 5. 認証とユーザー権限

### 確認できた事実
- `src/app/login/page.tsx` では Supabase Auth のメール認証と、LINE WORKS 2FA を組み合わせている
- `src/app/api/auth/lineworks-2fa/request/route.ts` では:
  - `supabaseAuthClient.auth.signInWithPassword()` により ID / Password 確認
  - `login_lineworks_otp` に OTP を保存
  - `user_entry_united_view_single` から `channel_id` を取得
  - `getAccessToken()` と `sendLWBotMessage()` で LINE WORKS に認証コード送信
- `trusted_device` / `login_trusted_devices` というテーブルがあり、端末を信頼すると 2FA を省略する実装が確認できる
- `src/context/RoleContext.tsx` では `users.system_role` を取得して `admin | manager | member` に変換している
- `src/app/portal/layout.tsx` では `role` に応じてメニュー表示の差異を出している
- `system_role` の値が `admin`, `manager` を中心に利用されている

### 推定・補足
- 「一般ユーザー」「マネージャー」「管理者」の3階層が主要判定であり、管理者向けページがアクセス制御されていると考えられる
- ただし、実際の厳密な RBAC および保存場所の全網羅は確認しておらず、各ページで個別に `role` を参照している実装が広く散在している
- `role` の名称と `users.role` / `users.system_role` が別用途で併存している可能性があるが、コード上の主要利用実装は `system_role` が権限判定に使われている

---

## 6. 主要テーブル / View と利用画面

以下はコードと型定義から確認できた主要エンティティの例です。

### 6-1. ユーザー・登録関連
- `form_entries`
  - エントリー情報の中心テーブル
  - 姓名、住所、メール、資格、添付ファイル、同意事項などを保持
  - `src/app/entry/page.tsx` と `src/app/portal/page.tsx` で利用

- `users`
  - 認証ユーザーと業務ユーザーの結びつき
  - `auth_user_id`, `user_id`, `system_role`, `status`, `org_unit_id`, `position_id`, `service_type` 等を保持
  - 権限・所属情報の参照に用いられる

- `user_entry_united_view_single`
  - 認証処理や通知送信時に、ユーザーの `auth_user_id` と `channel_id` をまとめて取得するための View とみられる
  - `src/app/api/auth/lineworks-2fa/request/route.ts` で利用

### 6-2. シフト・勤務管理
- `shift`
  - シフト本体
  - `shift_id`, `cs_kaipoke` 連携、開始/終了時間、日付など

- `shift_records`
  - 実際の勤務記録、詳細項目

- `shift_temp`
  - シフトテンポラリ/候補などの処理用データ

- `shift_service_code`
  - サービスコード定義

- `shift_wishes`
  - シフト希望

- `shift_assign_log`
  - シフト割り当てログ

- `shift_record_category_l`, `shift_record_category_s`, `shift_record_item_defs`, `shift_record_items`
  - 訪問記録定義・項目定義関連

これらは `src/app/portal/shift/page.tsx`, `src/app/portal/roster/*`, `src/app/portal/shift-view/page.tsx` に関連している

### 6-3. 利用者・書類・利用者情報
- `cs_kaipoke_info`
  - 利用者情報の中心テーブル

- `cs_docs`
  - 利用者書類と関連情報

- `cs_kaipoke_info_documents_snapshots`
  - 文書スナップショット管理

- `form_entries_view`, `form_entries_ordered`, `form_entries_with_status`
  - 画面表示や一覧用の View

### 6-4. 通知・監査・承認
- `alert_log`
  - 通知/アラートの履歴や状態記録

- `audit_log`
  - 監査ログ

- `wf_request`, `wf_approval_step`
  - 承認フロー

- `login_lineworks_otp`, `login_trusted_devices`
  - 2FA 認証と信頼端末管理

- `env_variables`
  - `saiyou` 系の設定値を保持している

### 6-5. LINE WORKS 連携用データ
- `group_lw_channel_info`
  - LINE WORKS メッセージの送信先チャンネルの変換や関連情報を持つ

- `org_unit` 系、`users_lw_temp` など
  - LINE WORKS 連携された組織・ユーザーの同期情報

---

## 7. 外部連携

### LINE WORKS
確認できた実装:
- `src/lib/lineworks/sendLWBotMessage.ts`
- `src/lib/lineworks/getAccessToken.ts` 系のモジュール
- `src/app/api/auth/lineworks-2fa/request/route.ts`
- `src/app/api/auth/lineworks-2fa/verify/route.ts`
- 通知系 API: `/api/cron/*`, `/api/lineworks/*`, `/api/expense-reimbursement/*`

役割:
- 認証コードの通知
- リマインド通知
- Bot のメッセージ送信
- 組織 / ユーザー同期に関わるデータ取得

### OpenAI
確認できた実装:
- `src/lib/openaiProfiles.ts`
- `src/app/api/assessment/[id]/auto-generate/route.ts`
- `src/app/api/plans/generate/route.ts`
- `src/lib/supabase/analyzeMessages.ts`
- `src/lib/user_ojt.ts`

役割:
- 文章要約
- 予定・計画生成
- 評価項目の自動生成
- 分析・処理補助

### Google
確認できた実装:
- `src/app/api/upload/route.ts`
- `src/app/api/google-calendar/register-calendars/route.ts`
- `src/app/api/cron/google-calendar-sync/route.ts`
- `googleapis` パッケージ

役割:
- Drive へのファイルアップロード
- カレンダー同期

### Twilio
確認できた実装:
- `src/lib/sms.ts`
- `src/app/api/sms/send/route.ts`
- `src/app/api/taimee-emp/send/route.ts`

役割:
- SMS 送信

### 郵便番号検索
確認できた実装:
- `src/app/entry/page.tsx`
- `https://zipcloud.ibsnet.co.jp/api/search`

役割:
- 郵便番号から住所補完

---

## 8. lint、型チェック、build コマンド

`package.json` から確認できた内容:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

確認できたこと:
- 開発サーバー起動: `npm run dev`
- 本番ビルド: `npm run build`
- 実行: `npm run start`
- Lint: `npm run lint`

未確認事項（コード上の事実）:
- `package.json` に `typecheck` スクリプトは明示されていない
- TypeScript の型チェックが `tsc --noEmit` で行われているかどうかは、package scripts からは確認できない
- ただし Next.js のビルド時には型チェックが走る構成である可能性が高いが、厳密な実行条件は package.json だけでは断定できない

---

## 9. 未確認事項と推定事項

### 9-1. 事実としてコードから確認できた内容
- アプリは Next.js (App Router) で構成されている
- Supabase Auth と Supabase Database を中心にした認証・データ管理を行っている
- 経営/運用のための管理者向け機能と、一般ユーザー向けの個人情報管理機能が同居している
- LINE WORKS 2FA / 通知、Google Drive・Google Calendar、OpenAI、Twilio などを利用している
- `system_role` や `role` による機能表示差分が存在する
- `database.types.ts` には多数のテーブルと View が存在し、業務の複雑さが高いことが確認できる

### 9-2. 推定した内容
- 本アプリは、単なる人材登録フォームではなく、実運用システムとしての社内業務平台に近い
- 管理者向けと一般ユーザー向けの権限差は多数の画面で個別制御されており、完全な RBAC ではなく画面単位のアクセス制御が混在している可能性が高い
- LINE WORKS 連携は「認証」「エラーハンドリング」「通知」「組織同期」など複数の責務を持つと推定される
- `database.types.ts` や API Route 数から、現在のシステムは機能追加型で高度に拡張されてきたデータモデルが存在する可能性が高い

### 9-3. 記載を避けた事項
- 環境変数の実際の値
- API キーやトークン、認証情報
- 利用者の個人情報や連絡先、メールアドレス本体
- 系統的に秘密にすべき情報や社外公開を避けるべき客体

---

## 10. まとめ

このアプリは、採用・エントリー管理、ユーザー認証、シフト管理、現場データ集計、勤務記録、承認・監査、そして LINE WORKS / OpenAI / Google / Twilio などの外部連携をまとめた大規模な業務アプリケーションであると整理できる。

特に特徴的なのは、次の3点である:
1. Supabase を中心としたデータ基盤が明確に存在する
2. App Router と API Route の両方を使って業務処理を分割している
3. 認証、2FA、通知、ロール管理、連携が複数レイヤーで組み合わさっている

なお、この文書はコードベースから確認できる事実と、推定に基づく解釈を分離して整理している。実運用ルールの最終決定には、関連する DB 制約、Supabase Policy、実際のアクセス制御実装の精査が必要である。
