# Sharefull RPAテスト手順

## モード設定

Sharefull RPAは環境変数でモードを切り替える。通常画面からの自由なモード切替は行わない。

```env
SHAREFULL_RPA_MODE=test
SHAREFULL_AUTO_POST_ENABLED=false
SHAREFULL_AUTO_POST_MODE=save
```

テストモードでは、Sharefull専用テストテーブルだけを読み書きする。タイミー側の通常同期は停止しない。

## 実行順序

1. テスト用マイグレーションを適用する。
2. `seed_sharefull_rpa_test_data('12782561')`でテストデータを作成する。
3. テスト用テンプレート作成ジョブを実行する。
4. 審査完了後、案件掲載ジョブの登録だけを確認する。
5. `SHAREFULL_AUTO_POST_MODE=save`で入力・保存を確認する。
6. 問題がなければ`publish`へ変更して実掲載を確認する。
7. 応募なし・`募集なし`の案件でクローズ処理を確認する。
8. 求人ID・管理番号不一致時に即時中止されることを確認する。
9. `applied`、`confirmed`、複数媒体応募の順に応募状態を確認する。

## テストデータの安全条件

- 表示項目には `【テスト】` が付く。
- 日付は元データの間隔を維持したまま、実行日の翌日を初日とする。
- Sharefullの求人ID・管理番号・掲載状態は初期化される。
- 本番の `spot_offer_*` テーブルはテストモードから参照しない。
