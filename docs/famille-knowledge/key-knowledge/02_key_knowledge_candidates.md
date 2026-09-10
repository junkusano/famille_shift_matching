# キーナレッジ候補

最終確認: 2026-09-09。候補は、ローカルの設計資料と実装から根拠を取った。`public` は公開してよい原文を意味せず、この候補自体に個人情報や機密を含めず外部説明にも使える抽象化ができる、という整理である。公開時は別途承認する。

## 1. ファミーユナレッジの階層設計

- **key**: `famille-knowledge-layered-architecture`
- **category / concept_level**: ファミーユナレッジ / Level 1: 原則・思想
- **importance / stability / confidentiality**: 5 / core / internal
- **何なのか**: 原本、原本の索引、確定指標、再利用可能なナレッジを分ける知識基盤の考え方。
- **背景と意味**: すべての文書・会話・コードを毎回AIへ渡すと、費用、根拠追跡、機密管理が破綻しやすい。原本は原本システムに残し、再利用価値のある事実・判断・教訓だけを知識として昇格させる。
- **使われ方**: 社内検索、経営分析、AIの社内回答、記事候補、設計判断の参照に使う前提。Outputは通常この層を起点にし、必要時のみ一次情報へ降りる。
- **変わりにくい部分**: 原本を複製しない、根拠をたどれる、公開可否を別管理する。
- **変わり得る部分**: テーブル名、connector、保管先、同期頻度。
- **根拠**: `docs/knowledge-engine/README.md`、`sync-contracts.md`、`202609051200_knowledge_engine_v01.sql`

## 2. 人が最終判断と公開承認を担う

- **key**: `human-review-and-publication-boundary`
- **category / concept_level**: AI活用方針 / Level 1
- **importance / stability / confidentiality**: 5 / core / internal
- **何なのか**: AI生成物、確認済み事実、公開可能な情報を同一視せず、人のレビューと承認を経て初めて外部利用する原則。
- **背景と意味**: AIの要約・文章生成は下書きや候補の作成を助けるが、事実確認、個人情報、誤解の可能性、公開判断は自動で確定しない。
- **使われ方**: `review_status`、`verification_status`、privacy、publishability、承認者・承認日時を分け、公開には全条件を求める。
- **変わりにくい部分**: AIだけで公開承認しないこと。
- **変わり得る部分**: 承認画面、承認者、作業フロー。
- **根拠**: `docs/knowledge-engine/README.md`、`src/lib/knowledge/types.ts`

## 3. プライバシーを先に判定し、原文を広げない

- **key**: `privacy-first-source-boundary`
- **category / concept_level**: 情報ガバナンス / Level 1
- **importance / stability / confidentiality**: 5 / core / restricted
- **何なのか**: 個人情報・機微情報を含み得る原本は、要約やAI利用より先に機密区分と公開可否を判定し、必要最小限の索引だけを扱う原則。
- **背景と意味**: FAX、利用者様記録、Voice、応募者情報、社内会話は、便利さのために横断コピーしてはいけない。
- **使われ方**: FAXはprivacy 3 / never_publish。検知時は安全な抜粋を消し、外部AI利用を止める。Voiceの秘密録音は録音者本人以外の一覧・二次利用から除外する。
- **変わりにくい部分**: 個人情報を公開ナレッジや外部AIの材料にしないこと。
- **変わり得る部分**: 検知ルール、権限・保管実装。
- **根拠**: `src/lib/knowledge/privacy.ts`、Knowledge Engine資料、Voice migration

## 4. 草野思考ログを経営・編集の原材料として扱う

- **key**: `kusano-thought-log-editorial-source`
- **category / concept_level**: 経営思想・情報発信 / Level 2: 仕組み・体系
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: 草野思考ナレッジDBの思考ログを、テーマ・要約・主張・背景・関連ナレッジを持つ内部の思考原本として扱う。
- **背景と意味**: 外部情報だけではファミーユ固有の判断にならない。経営者の問題意識と現場の文脈を、記事や判断の独自性に結びつける。
- **使われ方**: Sheet行の変更をハッシュで検知し、意見・原則の候補を作る。公開記事では、原文をそのまま出さず、事実と見解を分けて人が編集する。
- **変わりにくい部分**: 思考ログは外部情報をファミーユの判断へつなぐ役割。
- **変わり得る部分**: Sheetの項目、記事化基準、公開方針。
- **根拠**: `googleSheets.ts`、Knowledge Engine source設定

## 5. 教訓を役割別に再利用する

- **key**: `role-based-lesson-reminders`
- **category / concept_level**: 組織文化・業務改善 / Level 3: 運用・方法
- **importance / stability / confidentiality**: 4 / slow_change / restricted
- **何なのか**: 過去の失敗・注意点・望ましい対応を、ヘルパー、マネジャー、総務、採用の役割ごとに繰り返し参照する仕組み。
- **背景と意味**: 個人の記憶だけに頼ると、異動・退職・忙しさで学びが失われる。役割と場面に結びつけることで、必要な時に思い出せる。
- **使われ方**: 原文を無差別にAIへ渡さず、匿名化でき、複数場面に再利用できる教訓だけを中間ナレッジへ昇格する。
- **変わりにくい部分**: 失敗を組織の学びに変えること。
- **変わり得る部分**: 役割区分、個々のリマインド、通知頻度。
- **根拠**: Knowledge Engine source設定、`googleSheets.ts`

## 6. MyFamilleを運営情報のハブにする

- **key**: `myfamille-operational-hub`
- **category / concept_level**: MyFamille / Level 2
- **importance / stability / confidentiality**: 5 / slow_change / internal
- **何なのか**: 訪問介護・障害福祉の運営に必要な利用者様、記録、実績、シフト、モニタリング、採用、RPA、FAXなどの業務情報を、権限つきで扱うアプリケーション基盤。
- **背景と意味**: 業務データを個別ツールに閉じず、画面・API・RPAの共通基盤にすることで、記録と運営判断の間をつなぐ。
- **使われ方**: 集計条件を明示した事実・傾向をナレッジ候補にし、個別利用者様データは既存業務権限の範囲に残す。
- **変わりにくい部分**: 業務情報の基盤であり、他の仕組みの連携先になること。
- **変わり得る部分**: 機能構成、画面、テーブル、外部連携。
- **根拠**: アプリ構成、Knowledge Engine資料、RPA連携実装

## 7. ファミーユVoiceは文脈付きの音声記録である

- **key**: `famille-voice-contextual-transcription`
- **category / concept_level**: ファミーユVoice / Level 2
- **importance / stability / confidentiality**: 5 / slow_change / restricted
- **何なのか**: 音声を文字起こしし、対象の利用者様、打合せの文脈、参加者、録音日時とともに保存するファミーユ独自の仕組み。
- **背景と意味**: 文字起こしだけでは、誰に関するどの場面の記録か分からず、後から業務に使えない。訪問、モニタリング、担当者会議、ご家族・ケアマネジャーとの会話、社内会議などの文脈を持たせる。
- **使われ方**: 録音を分割して文字起こしし、参加者ラベルとcontextを保存する。秘密録音は録音者本人のみが見られ、一覧・二次利用から除外する。
- **変わりにくい部分**: 音声を単体メモではなく、業務文脈つきの記録として扱うこと。
- **変わり得る部分**: 文字起こしモデル、選択肢、画面、保存形式。
- **根拠**: `famille-voice54/constants/recording-options.ts`、`types/local-recording.ts`、migration、`src/lib/recording-transcripts.ts`

## 8. RPAとRPA Runnerは実行場所を分ける

- **key**: `rpa-runner-controlled-execution`
- **category / concept_level**: RPA / Level 2
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: ブラウザ拡張が対象サービスの画面操作を担い、ローカルRunnerがMyFamilleから受け取ったジョブを実行して進捗を返す分離構成。
- **背景と意味**: 外部サービス画面を操作する自動化では、クラウド側だけで実行せず、実行環境・ジョブ・進捗・失敗を分けて追跡できる必要がある。
- **使われ方**: タイミー、Sharefull、利用者同期などの定型作業をジョブ化する。RPAの実行結果・個別ログはキーナレッジにせず、再利用できる制約・運用原則だけを昇格する。
- **変わりにくい部分**: 実行と指示・進捗記録を分離し、失敗を追えること。
- **変わり得る部分**: 対象サービス、ハンドラ、ジョブ定義。
- **根拠**: `famille-rpa`、`famille-rpa-runner` のREADME・ジョブ実装、MyFamille RPA API

## 9. 訪問記録とチームスコアは期限・協働を可視化する

- **key**: `visit-record-and-team-performance`
- **category / concept_level**: 訪問介護事業運営 / Level 3
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: 訪問記録の未完了・期限を確認し、チーム単位の実績、会議、期限遵守などを可視化して改善につなげる運用。
- **背景と意味**: 個人任せの記録では、利用者様への支援の継続性と事業運営の両方に影響する。チームの状況として早めに把握する。
- **使われ方**: 期限確認、リマインド、チームスコア、管理者向け表示に使う。個人別点数や利用者様別の記録は公開・横断AIの材料にしない。
- **変わりにくい部分**: 記録を後回しにせず、チームで改善すること。
- **変わり得る部分**: スコア計算式、期限、対象指標。
- **根拠**: 訪問記録・チームスコアmigration、`shift_record_check.ts`

## 10. 採用・スポット稼働は重複を避け人が送信を確認する

- **key**: `recruitment-and-spot-workflow`
- **category / concept_level**: 採用 / Level 3
- **importance / stability / confidentiality**: 4 / changing / restricted
- **何なのか**: タイミー候補の確認とSMS、再応募、Sharefull求人掲載を、登録済み・対象外・送信済みを区別して進める運用。
- **背景と意味**: 応募者への連絡や求人掲載は、重複・誤送信・対象誤りの影響が大きい。自動化は候補抽出と進捗管理に使い、送信・公開は確認できる状態にする。
- **使われ方**: 候補・除外理由・送信状態・掲載状態を管理する。応募者の氏名、電話番号、書類本文はキーナレッジに含めない。
- **変わりにくい部分**: 重複防止と人の送信判断。
- **変わり得る部分**: 提携サービス、対象条件、SMS文面、求人テンプレート。
- **根拠**: `famille-rpa`採用実装、`taimee`・`spot-sync`、採用migration

## 11. 財務は確定指標を先に作り、AIは説明に使う

- **key**: `deterministic-financial-metrics-first`
- **category / concept_level**: 記録・請求 / Level 2
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: 請求管理表、Money Forward、MyFamilleの実績を、決定的な計算で確定指標にしてから月次の説明・判断補助に用いる原則。
- **背景と意味**: AIに数値計算・集計条件の解釈を任せると、再現性と監査性が落ちる。数字はコードと期間・条件で確定させる。
- **使われ方**: 月次の提供実績、請求、売上、PL・BSの傾向を結合し、AIは確定値から説明文や確認観点を作る。
- **変わりにくい部分**: 数字をAIの推測で作らないこと。
- **変わり得る部分**: 指標定義、会計連携、月次の締め時期。
- **根拠**: Knowledge Engine資料、請求・Money Forward connector設計

## 12. 変更履歴から再利用可能な設計判断だけを抽出する

- **key**: `code-change-to-design-knowledge`
- **category / concept_level**: システム設計思想 / Level 3
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: MyFamille、RPA、RPA Runnerのコード・PR・commitから、仕様変更、制約、設計判断だけを知識として抽出する方針。
- **背景と意味**: コード全文を毎回読むと費用も機密リスクも高い。重要な変更を根拠パス・commitと結び、必要時だけ近傍コードへ掘り下げる。
- **使われ方**: 通常は設計要約を参照し、疑義があるときだけ該当ファイル・差分を読む。秘密情報、依存物、生成物、バイナリ、lockfileは対象外。
- **変わりにくい部分**: 差分中心・根拠追跡・全文を再保存しないこと。
- **変わり得る部分**: 対象リポジトリ、解析対象パス、GitHub連携方法。
- **根拠**: `sync-contracts.md`、ローカルGit履歴、各リポジトリ

## 13. 情報発信は根拠・見解・公開安全性を分ける

- **key**: `responsible-information-publishing`
- **category / concept_level**: 情報発信 / Level 2
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: 外部情報、ファミーユの見解、公開可否を分け、記事・案内を下書きから確認して届ける運用。
- **背景と意味**: 発信を量産しても、情報が古い・根拠不明・内部情報混入なら価値を失う。記事はファミーユの実践と判断を読者が確かめられる形にする。
- **使われ方**: RSSや草野思考を材料にし、公開可能な事実と見解を分ける。WordPress連携は下書き・公開・検証を扱うが、公開自動化の可否は別ポリシーとして管理する。
- **変わりにくい部分**: 根拠・見解・公開判断を分けること。
- **変わり得る部分**: 承認モード、記事テンプレート、配信先。
- **根拠**: ブログ自動化資料・実装、Knowledge Engine資料

## 14. 災害・イベント情報は「確認して必要な相手へ」届ける

- **key**: `safety-and-inclusion-information-delivery`
- **category / concept_level**: 災害対応・障害者余暇支援 / Level 3
- **importance / stability / confidentiality**: 3 / changing / internal
- **何なのか**: 災害・気象や、障害のある方の地域参加につながるイベント情報を、確認した上で掲示・案内につなげる運用。
- **背景と意味**: 時間性の高い外部情報は、記事のために集めるのではなく、利用者様の安全や地域での暮らしに役立つ場合に届ける。
- **使われ方**: イベントタスク、アラート、掲示・通知の対象。個別イベントや当日の気象はキーナレッジにせず、週次中間ナレッジに置く。
- **変わりにくい部分**: 確認と対象者の必要性を優先すること。
- **変わり得る部分**: 情報源、対象地域、イベント、配信条件。
- **根拠**: イベントタスク・アラートの型とroute、knowledge automation設定

## 15. Web分析は個人追跡でなく改善仮説の材料にする

- **key**: `web-analytics-for-content-improvement`
- **category / concept_level**: LLMO・GEO / Level 3
- **importance / stability / confidentiality**: 3 / changing / internal
- **何なのか**: Google AnalyticsとMicrosoft Clarityの集計傾向を、サイトの情報設計・記事テーマ・導線の改善仮説に使う。
- **背景と意味**: 表示回数や行動をそのまま目的にせず、読者が必要な情報にたどり着けているかを考える材料にする。
- **使われ方**: 個人を特定しない範囲の傾向を週次で要約し、発信や画面改善の仮説へつなげる。個別セッションや録画をキーナレッジにしない。
- **変わりにくい部分**: 分析は判断を補助し、個人追跡に使わないこと。
- **変わり得る部分**: 指標、計測設定、対象ページ。
- **根拠**: web analytics source migration、Knowledge Engine資料

## 16. FAXは内部索引から一般化できる教訓だけを扱う

- **key**: `fax-restricted-knowledge-boundary`
- **category / concept_level**: FAX・内部限定ナレッジ / Level 3
- **importance / stability / confidentiality**: 5 / core / restricted
- **何なのか**: FAXは業務上の重要な情報源だが、OCR全文や個別文書を汎用ナレッジにコピーせず、複数事例に再利用できる匿名化済み教訓・傾向だけを候補にする方針。
- **背景と意味**: FAXには個人情報・機微情報が含まれ得るため、検索性と安全性を両立させるには原文と知識を分離する必要がある。
- **使われ方**: 元文書は既存FAX画面と既存権限で確認する。公開用の要約は作成しない。
- **変わりにくい部分**: 原文を複製しない、never_publish、既存権限を守ること。
- **変わり得る部分**: 文書分類、索引UI、匿名化基準。
- **根拠**: Knowledge Engine資料、privacy実装、GAS FAX受信処理

## 17. シフ子／シフ子Connectは働き手が希望する勤務を自ら選ぶ仕組み

- **key**: `shifco-self-coordination`
- **category / concept_level**: シフ子Connect・チーム運営 / Level 2
- **importance / stability / confidentiality**: 4 / slow_change / internal
- **何なのか**: 職員がサービス・時間帯・場所に応じて、自分で希望するシフトを選ぶ「シフトセルフコーディネート」の仕組み。ローカル実装では通称を「シフ子」としている。
- **背景と意味**: 勤務希望を一方的に割り当てるのではなく、働き手の希望とサービス提供の必要を接続する。掲載されていない勤務希望も「シフトWish」として受け取り、マネジャーがケアマネジャー・相談員への調整を行う前提になっている。
- **使われ方**: 職員向けのシフト一覧・希望提出・訪問記録の導線、採用・再応募時の案内、スポット稼働との接続に使われる。利用者様・職員個人のシフト詳細はキーナレッジに含めない。
- **変わりにくい部分**: 働き手の希望を起点に、必要なサービスと結びつけること。
- **変わり得る部分**: 画面、希望条件、対象サービス、募集件数、マネジャーの調整方法、外部求人サービスとの連携。
- **根拠**: `src/app/portal/shift-coordinate/page.tsx`、`src/components/shift-coordinate-performance-test/ShiftCoordinatePerformanceTestClient.tsx`、`supabase/migrations/202608171600_regular_shift_requests.sql`、採用・再応募案内
## 保留候補

FBP、ヘルパーサービス5.0は、今回内容を確認できるローカル原本がなかったためJSONには入れていない。シフ子／シフ子Connectはローカル実装で確認できたため候補化したが、Googleフォルダー・LINE WORKSの補足資料は次回確認する。



## 追加候補（2026-09-09）

### Level 1：組織を横断する原則

| key | 候補 | 重要度 | 安定性 | 扱い |
| --- | --- | ---: | --- | --- |
| corporate-creed-kokoro-no-ishizue | 心の礎を組織の判断基盤として扱う | 5 | core | 指針本文を確認後に具体化。 |
| ownership-leadership-principle | 上位者が課題を自分ごととして進めるOwnership | 5 | core | Forマネジャー原本はrestricted。 |
| process-improvement-over-person-blame | 人を責めず、プロセスを改善する | 5 | core | 個別トラブルは一般化せず根拠つきで扱う。 |
| compliance-as-growth-foundation | 法令遵守を成長と自動化の前提にする | 5 | core | LINE WORKS本文の確認後に制度・歴史を追加。 |

### Level 2：思想を仕組みへ落とす候補

| key | 候補 | 重要度 | 安定性 |
| --- | --- | ---: | --- |
| famille-breakthrough-process | FBP：採用・育成・定着を事業成長へつなぐ体系 | 5 | slow_change |
| manager-as-team-capacity-builder | マネジャーは、誰でも入れる情報とチーム提供力をつくる | 5 | slow_change |
| helper-service-4-operating-model | ヘルパーサービス4.0：情報・記録・連絡を現場へ返す | 4 | slow_change |
| paperless-location-independent-office | 行かない事務：紙と場所に依存しない間接業務 | 4 | slow_change |
| office-relocation-as-service-area-design | 移転をサービス提供体制の再設計として扱う | 3 | changing |
| career-growth-through-manager-experience | 個人の成長をチームと利用者様の安心へ結ぶ | 4 | slow_change |

### Level 3：制度・日常運用として分ける候補

| key | 候補 | 重要度 | 安定性 | 区分理由 |
| --- | --- | ---: | --- | --- |
| team-capacity-linked-evaluation | チームの提供力を育てる評価・報酬の考え方 | 4 | changing | 金額・適用日を核から分離する。 |
| daily-pay-as-financial-flexibility | 日払い制度を柔軟な受取りの運用知として扱う | 2 | changing | 締切・金額・控除・対象は現行確認が必須。 |

### 既存候補の更新：シフ子／シフ子Connect

shifco-self-coordination は、社内で希望を選ぶシフ子だけでなく、外部募集との連動で必要なサービスを止めないシフ子Connectとして更新した。担当決定後にもう一方の募集を止める流れは、二重募集・手戻りを減らす運用知である。連携先、開始時点、対象範囲はchangingとして一次資料・現行実装で確認する。

- Level 2追加：growth-through-structural-problem-solving（importance 4 / slow_change）。人手不足を採用・定着・標準化・DXの仕組みで乗り越える歴史的な判断軸として候補化し、各記事の時期・数値・因果関係は本文確認後に確定する。

## 追加候補（ヘルパーサービス2.0・3.0と仕組み化）

| key | 概念レベル | 重要度 | 安定性 | 内容 |
| --- | ---: | ---: | --- | --- |
| helper-service-2-foundation | 2 | 5 | slow_change | ペーパーレスとホワイトな人事制度を、リモート運営・統合・報酬向上の土台にする。 |
| large-scale-operating-model | 1 | 5 | slow_change | 大型化を、安定提供・育成・報酬原資を高める必須命題として扱う。 |
| helper-service-3-data-automation | 2 | 5 | slow_change | 集まったデータを二次活用し、RPA・Bot・連携で作業を自動化する。 |
| behavior-change-through-system-design | 1 | 5 | core | Can／Must／Wantに届く仕組みで、行動可能な環境をつくる。 |

### 教訓リマインドの更新

role-based-lesson-reminders をimportance 5、core、restrictedへ更新した。トラブル・苦情の原文と影響を含む実例は、必要な役割へ一日4回届ける内部Bot運用である。キーナレッジには原文を入れず、匿名化できる原則・再発防止の仕組み・原本への権限境界だけを持たせる。
