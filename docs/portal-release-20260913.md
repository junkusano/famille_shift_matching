# ポータル正式版への切り替え（2026-09-13）

シフ子、シフト・訪問記録、実績記録チェック・印刷は既存の正式URLからβ版の実装を表示します。β版のURLも互換用に維持します。API、データ、権限処理は変更しません。

旧画面（通常メニューに表示しない）:
- /portal/shift-coordinate-legacy
- /portal/shift-legacy
- /portal/disability-check-legacy
- /portal/jisseki-legacy/print
- /portal/jisseki-legacy/print/bulk

左メニューはツリー表示、スマホは新ヘッダー・下部メニューを標準にし、保存済みの旧設定は読みません。旧レイアウトは docs/archive/portal-before-release-20260913/layout.tsx.txt に保存しました。

## 復元
各 -legacy ディレクトリのファイルを元の正式ディレクトリへコピーし、実績記録チェック内の /portal/jisseki-legacy/ を /portal/jisseki/ に戻します。メニューを戻す場合は保存した layout.tsx.txt を src/app/portal/layout.tsx に復元し、確認後に再公開します。

## 公開結果
- 本番公開済み: dpl_GUpiBBRtd7NEVLqFR5PkdeXRJQMe
- URL: https://famille-shift-matching-b9376xasx-junkusanos-projects.vercel.app
- 型検査・本番ビルド成功。旧5ページの保存内容を比較検証済み。
- ブラウザー操作基盤の起動エラーにより、ログイン後の目視・操作確認は未実施。
- 本番ドメイン: https://myfamille.shi-on.net （上記デプロイへの割当を確認）
