# ナレッジ同期復旧とシステム診断タスク

## 実装した機能
- GitHubは25ファイルずつ同一コミットのスナップショットを同期し、保存完了後に続きの位置を記録する。旧方式の1500件打ち切り済み索引も初回に全件再走査する。
- コミットが更新されても走査途中のSHAを固定する。再走査完了後に削除済みの旧ファイル索引を無効化する。変更差分の要約ではなく、ページ単位のコード索引記録を残す。
- API/DBアクセスに期限を設定する。定期実行は時間予算が残る間だけ続きのページを進め、残りは次回へ回す。
- 自動化のテンプレート「Vercel・Supabaseのエラー診断」を追加。ログ集計、Advisor取得、コード索引と承認済み過去ナレッジの照合、修正候補を実行履歴に保存する。
- 「今すぐ実行」と「診断結果を見る」に対応。新規テーブル・DBマイグレーションは不要。

## 本番設定
以下をVercelのサーバー環境変数に設定する。秘密値はタスク設定・ナレッジ・ブラウザへ保存しない。
- DIAGNOSTICS_VERCEL_TOKEN: 対象チームのログ参照を許可した認証
- DIAGNOSTICS_VERCEL_PROJECT_ID: prj_p5vk6cacKDXzUjD3RZTNRs0CCoOh
- DIAGNOSTICS_VERCEL_TEAM_ID: team_2682F3soYG0ugOT4LLQOn14c
- DIAGNOSTICS_SUPABASE_ACCESS_TOKEN: 対象プロジェクトのManagement API参照を許可した認証。service_roleキーとは異なる。
- DIAGNOSTICS_SUPABASE_PROJECT_REF: rfvnmmvuessiqcswwbnf
既存GitHub Appの3環境変数とCRON_SECRETは継続利用する。

## 利用手順
1. コードを反映し、GitHub情報源の同期履歴でscanOffsetが進むことを確認する。完了後lastCommitShaが確定する。
2. /portal/knowledge-automation の新規作成で「Vercel・Supabaseのエラー診断」を選び保存する。既定は毎日9時・停止状態・保存のみ。
3. 「今すぐ実行」→「診断結果を見る」で接続と内容を確認し、定期実行を有効にする。
4. 過去の対処法は承認済みナレッジに登録し、timeout、invalid_mention、rls_disabled_in_public等の診断カテゴリをタグに付ける。個人情報を含まずprivacy_level<=1のpublic_summaryを照合結果に表示する。

## 判定の範囲
Vercelは公式CLI59.7.0と同じrequest-logs APIを使用。非公開仕様が変わった場合は取得失敗として表示する。最大5ページ、24時間指定。ただしログ保持期間が不明のため、0件や消失から解消を断定しない。Supabaseはsecurity/performance Advisorを確認し、DBの全実行ログまでは取得しない。
原文ログ・Advisorのdetailを保存せず、分類と件数を残す。コード候補は保存された現行索引から照合するが、本番デプロイのコミットとの一致は未検証と表示する。過去ナレッジや修正候補は原本確認が必要。
外部への通知、コード自動変更、DB権限変更、本番デプロイは診断タスクでは実行しない。

## 検証
node --test tests/knowledge-system-diagnostics.test.mjs
npm run typecheck
変更ファイルに対するeslint。
本番の認証設定・デプロイ後の実測は別途必要。
