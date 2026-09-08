# ブログ自動化

- 新規記事: `wordpress_blog` / `wordpress_post`。`approval_mode=automatic` の場合は公開し、公開APIとページ本文を再取得して確認する。その他の承認方法では下書きを保存する。
- リライト: `custom` / `wordpress_post` / `settings.operation=wordpress_blog_rewrite`。公開中の記事を対象に、GA4集計・更新日・本文を確認し、改善価値を調査した上で1日1件を更新する。
- 日次リライトは日本時間の日付を冪等キーに使い、手動実行と定期実行の重複を防ぐ。
- GA4の取得失敗や一覧にないURLを閲覧ゼロと判断しない。直近で更新した記事は候補から外す。
- 記事ID・URL・公開状態・画像・既存リンク・ブロックコメントを保持。更新直前に本文と更新日時を照合する。
- 更新前本文と更新予定本文、選定理由、根拠URLは `knowledge_automation_runs.output_summary` に保存する。保存に失敗した場合は記事を更新しない。
- `phase=prepared` は更新前の保存、`phase=published_verified` は公開確認の完了。更新後の確認失敗は失敗として記録し、成功扱いにしない。
- AI生成の出力上限は新規記事16,000トークン。途中終了した応答は公開しない。
- 実行エンドポイントの上限は800秒。長いタスクの後、残りのタスクは次の定期実行へ回す。

検証: `node --test tests/blog-rewrite.test.mjs` と `npm run typecheck`。

2026-09-08: 既存記事1574のリライトを実データで実行し、公開ページの本文を確認済み。更新前本文は実行履歴に保存。

2026-09-08: 新規記事の実タスクも公開・画像生成・カテゴリ設定・公開本文の照合まで成功。 https://shi-on.net/smart-ai-20260908-f406f23b/
