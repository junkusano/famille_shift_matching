# ブログ公開後のX・Threads投稿

新規記事・リライトの公開表示を確認した後、socialPublicationを実行履歴に保存し、SNSごとに `social.share_blog` ジョブを作成する。
AddToAnyの共有ボタンが開く標準の投稿画面と同じintent URLを使用する。API認証情報は不要で、RPA用Chromeのログインを使う。

## 投稿先とDOM根拠

- X: @JunKusano_Shion。snapshot 90dc2665-5925-4098-acf1-3889a47a1039、2026-09-13 10:17 JST。
- Threads: @famillehelperservice。snapshot 93f88f11-96ec-4628-9360-992042f8d587、2026-09-13 10:18 JST。
- DOMはChrome拡張から `rpa_page_snapshots` に保存される。チャット添付ではない。
- 投稿文は公開・更新のお知らせ、記事タイトル、記事URL。更新日を付け、Xの日本語文字数に収める。

## 実行と設定

Chrome拡張 0.3.27、Runner 0.1.3 が必要。対象ChromeでX・Threadsへログインする。
タスク設定は `social_sharing: true`、`social_accounts: {x, threads}`、`social_runner_id`、`social_enabled_at`。
準備中は `social_sharing: false, social_setup_status: "awaiting_runner_update"`。既存の記事公開・リライトは継続する。
有効化前に対象端末で同じpayloadの `dry_run:true` を使い、SNSへの投稿なしでアカウント・投稿欄・投稿文・ボタンを確認する。

SNSジョブIDは公開操作から決まる。同時実行・予約復旧でも同じジョブになる。
Chrome側はクリック前に永続マーカーを保存する。応答喪失やブラウザー停止後は再クリックせず、プロフィールで投稿URLを照合する。
投稿先のプロフィール、投稿文、記事リンク、投稿URLが一致して初めて完了。確認できない場合は要確認としてタブを残す。
新しい投稿を作ったか不明な状態でマーカー削除・別ジョブ再投入を行わない。

公開済み記事の保存履歴から予約の未完了分を次の定期実行で復旧する。下書き・スキップは投稿しない。
管理画面は記事公開とSNSのRPA実行待ち・処理中・完了・失敗を分けて表示する。
SNS投稿の成否はRPAジョブ履歴が正本。Chrome終了中・PC停止中は投稿待ちになる。

## 検証

- MyFamille: `node --test tests/blog-social.test.mjs tests/blog-rewrite.test.mjs`
- 拡張: `node --test tests/social-background.test.mjs`、`npm run typecheck`、`npm run build`
- Runner: `npm test`、`npm run build`
- 保存DOMの投稿欄を隔離Chromeで再現し8項目を検証。全ネットワーク要求を遮断し、本物のSNS投稿はしていない。
- 対象端末での実投稿・投稿後プロフィール照合は、拡張とRunnerの更新後に検証が必要。
