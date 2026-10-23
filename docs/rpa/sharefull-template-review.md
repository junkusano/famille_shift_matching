# Sharefull審査状態の観測ID照合

`POST /api/rpa/sharefull/template-status` は認証済みRPA操作者から、`core_id`、`sharefull_template_id`、`sharefull_template_status`（`template_review` / `ready_for_offer`）を受ける。

観測したSharefull IDが現在のテンプレート登録と一致する場合だけ状態を更新する。IDなし・旧ID・照会後に対象IDが変更された場合は409とし、案件状態の更新や掲載ジョブの登録へ進まない。作成し直したテンプレートへ古い観測結果が反映されることを防ぐ。

審査監視用の一覧取得は `GET /api/rpa/sharefull/cases?read_only=true` を使う。この取得では掲載照合を実行しない。通常の案件一覧取得と、審査通過を確認した状態更新からの掲載照合は維持する。

拡張0.3.51以降のカード単位判定と組み合わせる。サーバー公開後に各Runner接続先Chromeを更新する。旧拡張のIDなし通知は409となるため、更新が済んだか監視履歴で確認する必要がある。既存の掲載済みデータは、Sharefull実求人と照合するまで初期化しない。
