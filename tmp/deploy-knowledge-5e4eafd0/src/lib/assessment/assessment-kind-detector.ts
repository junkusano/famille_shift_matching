// src/lib/assessment/assessment-kind-detector.ts
import { getDefaultAssessmentContent } from "@/lib/assessment/template";
import {
  getDefaultElderCareAssessmentContent,
  type ElderCareAssessmentKind,
} from "@/lib/assessment/elder-care-template";
import type { AssessmentContent, AssessmentServiceKind } from "@/types/assessment";

export type AutoAssessmentKind = AssessmentServiceKind | ElderCareAssessmentKind;

export type WeeklyAssessmentSourceRow = {
  template_id?: number | string | null;
  kaipoke_cs_id?: string | null;
  weekday?: number | null;
  weekday_jp?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  service_code?: string | null;
  kaipoke_servicek?: string | null;
  kaipoke_servicecode?: string | null;
  plan_document_kind?: string | null;
  plan_service_category?: string | null;
  plan_display_name?: string | null;
  shift_start_date?: string | null;
  status?: string | null;
};

export type ClientAssessmentSource = {
  id: string;
  kaipoke_cs_id: string;
  name?: string | null;
  kana?: string | null;
  gender?: string | null;
  address?: string | null;
  phone_01?: string | null;
  phone_02?: string | null;
  birth_yyyy_mm_dd?: string | null;
  service_kind?: string | null;
  kaigo_hoken_no?: string | null;
  kaigo_start_at?: string | null;
  kaigo_end_at?: string | null;
  shogai_jukyusha_no?: string | null;
  shogai_start_at?: string | null;
  shogai_end_at?: string | null;
  ido_start_at?: string | null;
  ido_end_at?: string | null;
  documents?: unknown;
};

export function isElderCareAssessmentKind(kind: string | null | undefined): kind is ElderCareAssessmentKind {
  return kind === "要介護" || kind === "要支援";
}

export function isKnownAssessmentKind(kind: string | null | undefined): kind is AutoAssessmentKind {
  return kind === "障害" || kind === "移動支援" || isElderCareAssessmentKind(kind);
}

export function getAssessmentContentTemplate(kind: AutoAssessmentKind): AssessmentContent {
  return isElderCareAssessmentKind(kind)
    ? getDefaultElderCareAssessmentContent(kind)
    : getDefaultAssessmentContent(kind as AssessmentServiceKind);
}

export function detectAssessmentKindsFromWeeklyRows(rows: WeeklyAssessmentSourceRow[]): AutoAssessmentKind[] {
  const kinds = new Set<AutoAssessmentKind>();

  for (const row of rows) {
    const text = rowText(row);

    // 既存の障害・移動支援は plan_document_kind が最も信頼できる。
    // ただし shift_add_status_view 由来などでは plan_document_kind が空になるため、
    // サービス名・カイポケ区分・サービスコード文字列も見る。
    if (
      row.plan_document_kind === "障害福祉サービス" ||
      /障害福祉|居宅介護|重度訪問|同行援護|行動援護/.test(text)
    ) {
      kinds.add("障害" as AssessmentServiceKind);
    }

    if (
      row.plan_document_kind === "移動支援サービス" ||
      /移動支援|重度就労|自費/.test(text)
    ) {
      kinds.add("移動支援" as AssessmentServiceKind);
    }

    // 介護保険サービスの判定。
    // 要支援・介護予防系を先に判定し、要支援の行を要介護として重複判定しない。
    const isPreventiveCare =
      /要支援|介護予防|予防訪問|予防専門型|生活支援型|総合事業/.test(text);

    if (isPreventiveCare) {
      kinds.add("要支援");
    } else if (
      /要介護|介護保険|訪問介護|身体介護|生活援助|通院等乗降介助|訪介|ホームヘルプ/.test(
        text,
      )
    ) {
      kinds.add("要介護");
    }
  }

  return [...kinds];
}

export function detectAssessmentKindsFromClient(client: ClientAssessmentSource): AutoAssessmentKind[] {
  const text = [
    client.service_kind,
    client.kaigo_hoken_no ? "介護保険" : "",
    client.kaigo_start_at || client.kaigo_end_at ? "介護保険" : "",
    client.shogai_jukyusha_no ? "障害福祉" : "",
    client.shogai_start_at || client.shogai_end_at ? "障害福祉" : "",
    client.ido_start_at || client.ido_end_at ? "移動支援" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const kinds = new Set<AutoAssessmentKind>();
  if (/要介護|介護保険/.test(text)) kinds.add("要介護");
  if (/要支援|介護予防/.test(text)) kinds.add("要支援");
  if (/障害|障害福祉/.test(text)) kinds.add("障害" as AssessmentServiceKind);
  if (/移動支援/.test(text)) kinds.add("移動支援" as AssessmentServiceKind);
  return [...kinds];
}

export function rowBelongsToKind(row: WeeklyAssessmentSourceRow, kind: AutoAssessmentKind) {
  return detectAssessmentKindsFromWeeklyRows([row]).includes(kind);
}

export function buildAssessmentContentForKind(params: {
  kind: AutoAssessmentKind;
  client: ClientAssessmentSource;
  weeklyRows: WeeklyAssessmentSourceRow[];
  sourceText?: string | null;
}): AssessmentContent {
  const { kind, client, weeklyRows, sourceText } = params;

  const content = getAssessmentContentTemplate(kind) as AssessmentContent & Record<string, unknown>;

  content.basic = {
    client_name: client.name ?? "",
    kana: client.kana ?? "",
    gender: client.gender ?? "",
    address: client.address ?? "",
    phone_01: client.phone_01 ?? "",
    phone_02: client.phone_02 ?? "",
    birth_yyyy_mm_dd: client.birth_yyyy_mm_dd ?? "",
    service_kind: kind,
    kaigo_hoken_no: client.kaigo_hoken_no ?? "",
    kaigo_period: {
      start: client.kaigo_start_at ?? null,
      end: client.kaigo_end_at ?? null,
    },
  };

  const relevantWeeklyRows = weeklyRows.filter((row) => rowBelongsToKind(row, kind));

  content.weekly_services = relevantWeeklyRows.map((row) => ({
    template_id: row.template_id ?? null,
    weekday: row.weekday ?? null,
    weekday_jp: row.weekday_jp ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    duration_minutes: row.duration_minutes ?? null,
    service_code: row.service_code ?? null,
    plan_document_kind: row.plan_document_kind ?? null,
    plan_service_category: row.plan_service_category ?? null,
    plan_display_name: row.plan_display_name ?? null,
  }));

  content.source = {
    generated_from: "assessment/by-client/[kaipokeCsId]/auto-generate",
    source_policy:
      "資料にある内容のみ。根拠がない文章項目は空欄。ADL/IADL/認知系の選択項目は、問題情報がない場合、01（できる/自立/ない）を初期値にする。",
    source_text: sourceText ?? "",
  };

  if (isElderCareAssessmentKind(kind)) {
    fillElderCareBasicInformation(content, client);
    fillElderCareWeeklyServiceSummary(content, relevantWeeklyRows);
    fillElderCareTurningAssessment(content, sourceText);
    fillElderCareGettingUpAssessment(content, sourceText);
    fillElderCareSittingAssessment(content, sourceText);
    fillElderCareStandingAssessment(content, sourceText);
    fillElderCareWalkingAssessment(content, sourceText);
    fillElderCareStandingUpAssessment(content, sourceText);
    fillElderCareOneLegStandingAssessment(content, sourceText);
    fillElderCareBodyWashingAssessment(content, sourceText);
    fillElderCareNailCuttingAssessment(content, sourceText);
    fillElderCareVisionAssessment(content, sourceText);
    fillElderCareHearingAssessment(content, sourceText);

    // 第2群を一括判定
    fillElderCareDailyLivingAssessments(
      content,
      sourceText,
    );

    fillElderCareCognitionAndBehaviorAssessments(
      content,
      sourceText,
    );

    preserveElderCareDefaultChoices(content);
  }

  return content as AssessmentContent;
}

type ElderCareChoiceRule = {
  value: string;
  pattern: RegExp;
};

type ElderCareAssessmentRule = {
  rowKey: string;
  keywords: RegExp;
  choices: ElderCareChoiceRule[];
};

const ELDER_CARE_DAILY_LIVING_RULES: ElderCareAssessmentRule[] = [
  {
    rowKey: "lifefunction01_1",
    keywords:
      /移乗|乗り移り|ベッドから車いす|車いすからベッド|車椅子からベッド|便座への移動|椅子への移動|リフト移乗/,
    choices: [
      {
        value: "04",
        pattern:
          /全介助|全面介助|自力で移乗できない|一人では移乗できない|抱きかかえ|二人介助|リフト/,
      },
      {
        value: "03",
        pattern:
          /一部介助|部分介助|軽介助|身体を支え|手を添え|移乗介助が必要|介助して移乗/,
      },
      {
        value: "02",
        pattern:
          /見守り|声かけ|付き添い|安全確認|転倒リスク|ふらつき/,
      },
      {
        value: "01",
        pattern:
          /自立|自力で移乗|一人で移乗|介助なく移乗|問題なく移乗/,
      },
    ],
  },

  {
    rowKey: "lifefunction04_1",
    keywords:
      /食事摂取|食事動作|食事介助|摂食|食べる|食べられ|食べられる|自力摂取/,
    choices: [
      {
        value: "04",
        pattern:
          /全介助|全面介助|自分で食べられない|自力摂取できない|経管栄養|胃ろう|胃瘻|全量介助/,
      },
      {
        value: "03",
        pattern:
          /一部介助|部分介助|食事介助|口まで運ぶ介助|すくう介助|食べこぼし.*介助|介助が必要/,
      },
      {
        value: "02",
        pattern:
          /見守り|声かけ|促し|セッティング|配膳|食事を準備すれば|切り分け|安全確認/,
      },
      {
        value: "01",
        pattern:
          /自立|自力摂取|自分で食べられる|介助なく食事|食事動作に問題なし/,
      },
    ],
  },

  {
    rowKey: "lifefunction05_1",
    keywords:
      /排尿|尿失禁|失禁|トイレ.*尿|おむつ|オムツ|パッド|尿器|導尿|排泄介助/,
    choices: [
      {
        value: "04",
        pattern:
          /排尿.*全介助|排泄.*全介助|全面介助|常時おむつ|常時オムツ|全量失禁|導尿全介助/,
      },
      {
        value: "03",
        pattern:
          /排尿.*一部介助|排泄.*一部介助|おむつ交換|オムツ交換|衣服の上げ下ろし.*介助|後始末.*介助|トイレ介助/,
      },
      {
        value: "02",
        pattern:
          /排尿.*見守り|排泄.*見守り|声かけ|誘導|促し|時間を決めてトイレ|尿意が不明確/,
      },
      {
        value: "01",
        pattern:
          /排尿.*自立|排泄.*自立|トイレ自立|失禁なし|自分で排尿|介助なく排尿/,
      },
    ],
  },

  {
    rowKey: "lifefunction06_1",
    keywords:
      /排便|便失禁|失便|トイレ.*便|おむつ|オムツ|便器|摘便|排泄介助/,
    choices: [
      {
        value: "04",
        pattern:
          /排便.*全介助|排泄.*全介助|全面介助|常時おむつ|常時オムツ|全量失便|摘便/,
      },
      {
        value: "03",
        pattern:
          /排便.*一部介助|排泄.*一部介助|おむつ交換|オムツ交換|衣服の上げ下ろし.*介助|後始末.*介助|トイレ介助/,
      },
      {
        value: "02",
        pattern:
          /排便.*見守り|排泄.*見守り|声かけ|誘導|促し|時間を決めてトイレ|便意が不明確/,
      },
      {
        value: "01",
        pattern:
          /排便.*自立|排泄.*自立|トイレ自立|便失禁なし|自分で排便|介助なく排便/,
      },
    ],
  },

  {
    rowKey: "lifefunction07_1",
    keywords:
      /口腔衛生|口腔清潔|口腔ケア|歯磨き|歯みがき|義歯|入れ歯|うがい/,
    choices: [
      {
        value: "03",
        pattern:
          /全介助|全面介助|自分で.*できない|口腔ケア.*介助が必要|職員が.*歯磨き|家族が.*歯磨き/,
      },
      {
        value: "02",
        pattern:
          /一部介助|部分介助|見守り|声かけ|促し|仕上げ磨き|義歯.*洗浄.*介助|準備が必要/,
      },
      {
        value: "01",
        pattern:
          /自立|自分で.*歯磨き|自分で.*口腔ケア|介助なく.*口腔|問題なく.*歯磨き/,
      },
    ],
  },

  {
    rowKey: "lifefunction10_1",
    keywords:
      /上衣|上着|シャツ|衣服.*上半身|上半身.*着脱|服を着る|服を脱ぐ|更衣/,
    choices: [
      {
        value: "04",
        pattern:
          /全介助|全面介助|自分で着られない|自分で脱げない|上衣.*全介助|更衣.*全介助/,
      },
      {
        value: "03",
        pattern:
          /一部介助|部分介助|袖を通す.*介助|ボタン.*介助|ファスナー.*介助|上衣.*介助が必要/,
      },
      {
        value: "02",
        pattern:
          /見守り|声かけ|促し|衣服を準備|服を選ぶ.*支援|着る順番.*説明/,
      },
      {
        value: "01",
        pattern:
          /自立|自分で上衣|自分で着脱|介助なく着替え|更衣に問題なし/,
      },
    ],
  },

  {
    rowKey: "lifefunction11",
    keywords:
      /ズボン|パンツ|下衣|衣服.*下半身|下半身.*着脱|更衣/,
    choices: [
      {
        value: "04",
        pattern:
          /全介助|全面介助|自分で履けない|自分で脱げない|ズボン.*全介助|下衣.*全介助/,
      },
      {
        value: "03",
        pattern:
          /一部介助|部分介助|ズボンを上げる.*介助|ズボンを下げる.*介助|足を通す.*介助|下衣.*介助が必要/,
      },
      {
        value: "02",
        pattern:
          /見守り|声かけ|促し|衣服を準備|転倒防止.*見守り|着る順番.*説明/,
      },
      {
        value: "01",
        pattern:
          /自立|自分でズボン|自分で下衣|自分で着脱|介助なく着替え|更衣に問題なし/,
      },
    ],
  },
  {
    // 2-2 移動
    rowKey: "lifefunction02_1",
    keywords:
      /移動|屋内移動|室内移動|歩いて移動|車いすで移動|車椅子で移動|移動介助|移動手段|目的地まで移動/,
    choices: [
      {
        value: "04",
        pattern:
          /移動.*全介助|全介助で移動|全面介助|自力で移動できない|一人では移動できない|常時.*介助|抱きかかえて移動/,
      },
      {
        value: "03",
        pattern:
          /移動.*一部介助|一部介助で移動|部分介助|身体を支えて移動|移動介助が必要|車いすを介助|車椅子を介助/,
      },
      {
        value: "02",
        pattern:
          /移動.*見守り|見守りで移動|声かけで移動|付き添いが必要|転倒リスク|ふらつき|安全確認が必要|杖|歩行器|手すり/,
      },
      {
        value: "01",
        pattern:
          /移動.*自立|自力で移動|一人で移動|介助なく移動|屋内移動自立|問題なく移動/,
      },
    ],
  },

  {
    // 2-3 えん下
    rowKey: "lifefunction03_1",
    keywords:
      /えん下|嚥下|飲み込み|飲み込む|むせ|誤嚥|とろみ|刻み食|ミキサー食|経管栄養/,
    choices: [
      {
        value: "04",
        pattern:
          /嚥下.*できない|えん下.*できない|飲み込めない|経口摂取できない|経管栄養|胃ろう|胃瘻|誤嚥が著しい|全介助/,
      },
      {
        value: "03",
        pattern:
          /嚥下.*介助|えん下.*介助|飲み込み.*介助|食事形態.*調整|ミキサー食|ペースト食|とろみ.*必要|頻繁にむせる|誤嚥リスクが高い/,
      },
      {
        value: "02",
        pattern:
          /見守り|声かけ|むせることがある|時々むせる|刻み食|一口大|ゆっくり食べる|姿勢調整|嚥下に注意/,
      },
      {
        value: "01",
        pattern:
          /嚥下.*問題なし|えん下.*問題なし|飲み込み.*問題なし|普通食|むせなし|誤嚥なし|自力で飲み込める/,
      },
    ],
  },

  {
    // 2-8 洗顔
    rowKey: "lifefunction08_1",
    keywords:
      /洗顔|顔を洗|顔拭き|顔を拭|身だしなみ.*顔/,
    choices: [
      {
        value: "03",
        pattern:
          /洗顔.*全介助|全介助で洗顔|自分で顔を洗えない|顔を洗うことができない|職員が.*顔を洗う|家族が.*顔を洗う/,
      },
      {
        value: "02",
        pattern:
          /洗顔.*一部介助|部分介助|見守り|声かけ|促し|洗面用具.*準備|顔拭き.*介助|洗い残し/,
      },
      {
        value: "01",
        pattern:
          /洗顔.*自立|自分で顔を洗える|介助なく洗顔|問題なく顔を洗う|顔拭き自立/,
      },
    ],
  },

  {
    // 2-9 整髪
    rowKey: "lifefunction09_1",
    keywords:
      /整髪|髪を整|髪をとか|くし|ブラシ|寝ぐせ|身だしなみ.*髪/,
    choices: [
      {
        value: "03",
        pattern:
          /整髪.*全介助|全介助で整髪|自分で髪を整えられない|自分で髪をとかせない|職員が.*髪を整える|家族が.*髪を整える/,
      },
      {
        value: "02",
        pattern:
          /整髪.*一部介助|部分介助|見守り|声かけ|促し|くし.*準備|ブラシ.*準備|仕上げが必要/,
      },
      {
        value: "01",
        pattern:
          /整髪.*自立|自分で髪を整えられる|自分で髪をとかす|介助なく整髪|問題なく整髪/,
      },
    ],
  },

  {
    // 2-12 外出頻度
    rowKey: "lifefunction12",
    keywords:
      /外出頻度|外出する|外出している|買い物に行く|散歩に行く|通院する|デイサービスに行く|ほとんど外出しない|閉じこもり/,
    choices: [
      {
        value: "04",
        pattern:
          /全く外出しない|外出なし|寝たきりで外出できない|外出できない|一年以上.*外出していない|常時臥床/,
      },
      {
        value: "03",
        pattern:
          /月に一回未満|数か月に一回|ほとんど外出しない|通院時のみ外出|必要時のみ外出|閉じこもり/,
      },
      {
        value: "02",
        pattern:
          /月に一回|月数回|週一回未満|ときどき外出|家族と外出|付き添いで外出/,
      },
      {
        value: "01",
        pattern:
          /週一回以上|週に一回以上|週数回|毎日外出|定期的に外出|頻繁に外出|買い物や散歩に行く/,
      },
    ],
  },
];

function fillElderCareDailyLivingAssessments(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const sentences = splitAssessmentSourceText(text);

  for (const rule of ELDER_CARE_DAILY_LIVING_RULES) {
    const evidenceSentences = sentences
      .filter((sentence) =>
        testAssessmentPattern(
          rule.keywords,
          sentence,
        ),
      )
      .slice(0, 5);

    if (evidenceSentences.length === 0) {
      continue;
    }

    const evidence = evidenceSentences.join(" / ");

    const matchedChoice = rule.choices.find(
      (choice) =>
        testAssessmentPattern(
          choice.pattern,
          evidence,
        ),
    );

    if (!matchedChoice) {
      continue;
    }

    setRowChoice(
      content,
      "adl_iadl",
      rule.rowKey,
      matchedChoice.value,
      evidence,
    );
  }
}

function splitAssessmentSourceText(
  sourceText: string,
): string[] {
  return sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function fillElderCareHearingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractHearingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // ほとんど聞こえない場合を最優先
  if (
    /全ろう|聾|ほとんど聞こえない|全く聞こえない|聴力(?:は|が)?ない|音声による意思疎通ができない|大きな声でも聞こえない/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /聞こえにくい|耳が遠い|難聴|聴力(?:は|が)?低下|大きな声(?:で|なら)(?:聞こえる|理解できる)|補聴器|片耳が聞こえない|片耳難聴|近くで話せば聞こえる|繰り返し説明が必要/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /聴力(?:は|が)?(?:正常|良好|問題なし)|聞こえ(?:は|に)?問題なし|通常の声で聞こえる|日常会話に支障なし|補聴器なしで会話可能/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable13",
    value,
    evidence,
  );
}

function extractHearingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const hearingKeywords =
    /聴力|聞こえ|耳が遠|難聴|補聴器|全ろう|大きな声|片耳|日常会話/;

  return sentences
    .filter((sentence) =>
      hearingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareVisionAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractVisionEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // ほとんど見えない・全盲を最優先
  if (
    /全盲|失明|ほとんど見えない|視力(?:は|が)?(?:ない|著しく低下)|物の識別ができない|明暗しか分からない|視覚による確認ができない/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /視力(?:は|が)?低下|見えにくい|小さい文字が見えない|眼鏡(?:が|を)?必要|拡大鏡|白内障|緑内障|片目が見えない|片眼失明|視野が狭い|視覚障害/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /視力(?:は|が)?(?:良好|問題なし|正常)|日常生活に支障なし|眼鏡なしで見える|物を見ることができる|視覚に問題なし/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable12",
    value,
    evidence,
  );
}

function extractVisionEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const visionKeywords =
    /視力|見え|視覚|眼鏡|メガネ|白内障|緑内障|全盲|失明|視野|片眼|片目/;

  return sentences
    .filter((sentence) =>
      visionKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareNailCuttingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractNailCuttingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 自分ではできない・全面介助を最優先
  if (
    /つめ切り(?:は|が)?(?:できない|困難|不可|不能)|爪切り(?:は|が)?(?:できない|困難|不可|不能)|自分で爪を切(?:れない|ることができない)|爪切り全介助|つめ切り全介助|家族がすべて爪を切る|職員がすべて爪を切る/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /つめ切り(?:は|が)?(?:一部介助|部分介助)|爪切り(?:は|が)?(?:一部介助|部分介助)|足の爪(?:は|の爪切りは)?介助|手の爪は自分で切れるが足は介助|見守りで爪切り|声かけで爪切り|仕上げが必要|切り残しがあり介助/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /つめ切り(?:は|が)?(?:自立|可能|できる|問題なし)|爪切り(?:は|が)?(?:自立|可能|できる|問題なし)|自分で爪を切れる|手足の爪を自分で切る/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable11",
    value,
    evidence,
  );
}

function extractNailCuttingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const nailCuttingKeywords =
    /つめ切り|爪切り|爪を切|手の爪|足の爪/;

  return sentences
    .filter((sentence) =>
      nailCuttingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareBodyWashingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractBodyWashingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 全介助・自分では洗えない場合を最優先
  if (
    /洗身(?:は|が)?(?:できない|困難|不可|不能)|自分で体を洗(?:えない|うことができない)|洗身全介助|入浴全介助|全身を洗うのに全介助|身体を洗うのに全介助/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /洗身(?:は|が)?(?:一部介助|部分介助)|背中(?:は|の洗身は)?介助|足先(?:は|の洗身は)?介助|手の届かない部分(?:は|の洗身は)?介助|声かけで洗身|見守りで洗身|洗い残しがあり介助|一部自分で洗える/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /洗身(?:は|が)?(?:自立|可能|できる|問題なし)|自分で体を洗える|全身を自分で洗える|入浴動作自立|身体洗浄自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable10",
    value,
    evidence,
  );
}

function extractBodyWashingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const bodyWashingKeywords =
    /洗身|身体を洗|体を洗|全身を洗|身体洗浄|入浴介助|入浴動作/;

  return sentences
    .filter((sentence) =>
      bodyWashingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareOneLegStandingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractOneLegStandingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 片足立位ができない場合を最優先
  if (
    /片足(?:での)?立位(?:は|が)?(?:できない|困難|不可|不能)|片脚立位(?:は|が)?(?:できない|困難|不可|不能)|片足で立てない|片脚で立てない|片足立位不能/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま(?:れば|ると)?片足|手すりにつかま(?:れば|ると)?片足|支えがあれば片足立位|介助があれば片足立位|片足立位一部介助|見守りで片足立位/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /片足(?:での)?立位(?:は|が)?(?:自立|可能|できる|安定|問題なし)|片脚立位(?:は|が)?(?:自立|可能|できる)|自力で片足立位|片足で立てる/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable09",
    value,
    evidence,
  );
}

function extractOneLegStandingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const oneLegStandingKeywords =
    /片足立位|片脚立位|片足で立|片脚で立|片足保持|片脚保持/;

  return sentences
    .filter((sentence) =>
      oneLegStandingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareStandingUpAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractStandingUpEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 立ち上がれない・全介助を最優先
  if (
    /立ち上がり(?:は|が)?(?:できない|困難|不可|不能)|自力で立ち上が(?:れない|ることができない)|立ち上がり全介助|全介助で立ち上が|起立全介助|立ち上がる際に全介助/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま(?:れば|ると)?立ち上が|手すりにつかま(?:れば|ると)?立ち上が|支えがあれば立ち上が|介助があれば立ち上が|立ち上がり一部介助|見守りで立ち上が|家具につかまって立ち上が/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /立ち上がり(?:は|が)?(?:自立|可能|できる|問題なし)|自力で立ち上が|介助なく立ち上が|立ち上がり自立|起立自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable08",
    value,
    evidence,
  );
}

function extractStandingUpEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const standingUpKeywords =
    /立ち上がり|立ち上がる|立ち上がれ|起立動作|椅子から立|ベッドから立/;

  return sentences
    .filter((sentence) =>
      standingUpKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareStandingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractStandingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 立位保持できない場合を最優先
  if (
    /立位(?:は|が)?(?:保持できない|困難|不可|不能)|両足での立位(?:は|が)?(?:困難|できない)|自力で立位保持できない|立っていられない|立位保持全介助|立位不能/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま(?:れば|ると)?立位|手すりにつかま(?:れば|ると)?立位|支えがあれば立位保持|介助があれば立位保持|立位保持一部介助|見守りで立位保持/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /立位(?:は|が)?(?:自立|保持可能|保持できる|安定|問題なし)|両足で立位保持できる|自力で立位保持|立っていられる|立位保持自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable06",
    value,
    evidence,
  );
}

function extractStandingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const standingKeywords =
    /立位保持|立位|立っていられ|両足で立|立ち続け|起立保持/;

  return sentences
    .filter((sentence) =>
      standingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareSittingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractSittingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 保持できない・全面的な支えが必要な場合を最優先
  if (
    /座位(?:は|が)?(?:保持できない|困難|不可|不能)|自力で座位(?:を)?保持できない|座っていられない|座位保持全介助|体幹保持困難|支えても座位保持困難/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /支えがあれば座位保持|手すりにつかまれば座位保持|背もたれがあれば座位保持|何かにつかま(?:れば|ると)?座位|座位保持に支えが必要|座位保持一部介助|見守りで座位保持/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /座位(?:は|が)?(?:自立|保持可能|保持できる|安定|問題なし)|自力で座位保持|座っていられる|座位保持自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable05",
    value,
    evidence,
  );
}

function extractSittingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const sittingKeywords =
    /座位保持|座位|座っていられ|端座位|体幹保持|座った姿勢/;

  return sentences
    .filter((sentence) =>
      sittingKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareGettingUpAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences =
    extractGettingUpEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // できない・全介助を最優先で判定
  if (
    /起き上がり(?:は|が)?(?:できない|困難|不可|不能)|自力で起き上が(?:れない|ることができない)|起き上がり全介助|全介助で起き上がり|起き上がる際に全介助|起居動作全介助/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま(?:れば|ると)?起き上が|ベッド柵|手すり|柵につかま|一部介助で起き上が|起き上がり一部介助|声かけで起き上が|見守りで起き上が|支えがあれば起き上が/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /起き上がり(?:は|が)?(?:自立|可能|できる|問題なし)|自力で起き上が|介助なく起き上が|起き上がり自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable04",
    value,
    evidence,
  );
}

function extractGettingUpEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const gettingUpKeywords =
    /起き上がり|起き上がる|起き上がれ|起居動作|ベッドから起き|上体を起こ/;

  return sentences
    .filter((sentence) =>
      gettingUpKeywords.test(sentence),
    )
    .slice(0, 5);
}

function fillElderCareTurningAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences = extractTurningEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // できない・全介助を最優先で判定
  if (
    /寝返り(?:は|が)?(?:できない|困難|不可|不能)|自力で寝返り(?:できない|困難)|寝返り全介助|体位変換全介助|全介助で寝返り|寝返り介助が必要/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま(?:れば|ると)?寝返り|ベッド柵|手すり|柵につかま|一部介助で寝返り|寝返り一部介助|声かけで寝返り|見守りで寝返り|支えがあれば寝返り/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /寝返り(?:は|が)?(?:自立|可能|できる|問題なし)|自力で寝返り|介助なく寝返り|寝返り自立/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable03",
    value,
    evidence,
  );
}

function extractTurningEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const turningKeywords =
    /寝返り|体位変換|ベッド上で向きを変|ベッド柵につかま/;

  return sentences
    .filter((sentence) => turningKeywords.test(sentence))
    .slice(0, 5);
}

function fillElderCareWalkingAssessment(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const evidenceSentences = extractWalkingEvidence(text);

  if (evidenceSentences.length === 0) {
    return;
  }

  const evidence = evidenceSentences.join(" / ");

  let value: "01" | "02" | "03" | null = null;

  // 「できない」を最優先で判定します。
  if (
    /歩行(?:は|が|困難|不可|不能|できず|できない)|自力歩行(?:は|が)?(?:困難|不可|不能|できない)|歩けない|全介助|常時車いす|車椅子のみ/.test(
      evidence,
    )
  ) {
    value = "03";
  } else if (
    /何かにつかま|つかまり歩き|手すり|杖|歩行器|シルバーカー|見守り|一部介助|歩行介助|支えが必要/.test(
      evidence,
    )
  ) {
    value = "02";
  } else if (
    /歩行(?:は|が)?(?:自立|可能|できる|問題なし|安定)|自力歩行|独歩|介助なし/.test(
      evidence,
    )
  ) {
    value = "01";
  }

  if (!value) {
    return;
  }

  setRowChoice(
    content,
    "adl_iadl",
    "mobable07",
    value,
    evidence,
  );
}

function extractWalkingEvidence(
  sourceText: string,
): string[] {
  const sentences = sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const walkingKeywords =
    /歩行|歩け|独歩|杖|歩行器|シルバーカー|手すり|つかまり歩き|車いす|車椅子/;

  return sentences
    .filter((sentence) => walkingKeywords.test(sentence))
    .slice(0, 5);
}

function setRowChoice(
  content: Record<string, unknown>,
  sheetKey: string,
  rowKey: string,
  value: string,
  remark: string,
) {
  const sheets =
    (
      content as {
        sheets?: Array<{
          key: string;
          rows?: Array<Record<string, unknown>>;
        }>;
      }
    ).sheets ?? [];

  const sheet = sheets.find(
    (currentSheet) => currentSheet.key === sheetKey,
  );

  const row = sheet?.rows?.find(
    (currentRow) => currentRow.key === rowKey,
  );

  if (!row) {
    return;
  }

  row.value = value;
  row.remark = remark;
  row.check = "CIRCLE";
}

type ElderCareCognitionRule = {
  rowKey: string;
  keywords: RegExp;
  choices: Array<{
    value: string;
    pattern: RegExp;
  }>;
};

const ELDER_CARE_COGNITION_RULES: ElderCareCognitionRule[] = [
  {
    rowKey: "cognitive01",
    keywords:
      /意思伝達|意思を伝|意向を伝|要求を伝|コミュニケーション|会話|発語|自分の気持ち/,
    choices: [
      {
        value: "04",
        pattern:
          /意思伝達(?:は|が)?できない|意思を伝えられない|発語なし|会話不能|コミュニケーション不能/,
      },
      {
        value: "03",
        pattern:
          /ほとんど意思伝達できない|意思疎通が非常に困難|ごく限られた意思表示|反応がほとんどない/,
      },
      {
        value: "02",
        pattern:
          /ときどき伝達できる|簡単な意思表示|限定的に伝えられる|選択肢があれば答える|単語で伝える|身振りで伝える/,
      },
      {
        value: "01",
        pattern:
          /意思伝達(?:は|が)?できる|意思疎通可能|自分の意思を伝えられる|会話可能|受け答え良好/,
      },
    ],
  },

  {
    rowKey: "cognitive02",
    keywords:
      /日課|毎日の予定|一日の流れ|生活の流れ|スケジュール|予定を理解/,
    choices: [
      {
        value: "02",
        pattern:
          /日課(?:を)?理解できない|予定を理解できない|一日の流れが分からない|繰り返し説明が必要|予定を忘れる/,
      },
      {
        value: "01",
        pattern:
          /日課(?:を)?理解できる|予定を理解している|一日の流れを理解|日課に沿って行動/,
      },
    ],
  },

  {
    rowKey: "cognitive03",
    keywords:
      /生年月日|誕生日|年齢を答|年齢が分か|自分の年齢/,
    choices: [
      {
        value: "02",
        pattern:
          /生年月日(?:を)?答えられない|誕生日(?:を)?答えられない|年齢(?:を)?答えられない|自分の年齢が分からない|年齢を間違える/,
      },
      {
        value: "01",
        pattern:
          /生年月日(?:を)?答えられる|誕生日(?:を)?答えられる|年齢(?:を)?答えられる|自分の年齢を理解/,
      },
    ],
  },

  {
    rowKey: "cognitive04",
    keywords:
      /直前記憶|短期記憶|さっき|直前のこと|今聞いたこと|物忘れ|記憶/,
    choices: [
      {
        value: "02",
        pattern:
          /直前のことを覚えていない|短期記憶(?:の)?低下|今聞いたことを忘れる|同じことを繰り返し聞く|数分前のことを忘れる|物忘れが著しい/,
      },
      {
        value: "01",
        pattern:
          /直前のことを覚えている|短期記憶(?:は|に)?問題なし|今聞いたことを覚えている|記憶に問題なし/,
      },
    ],
  },

  {
    rowKey: "cognitive05",
    keywords:
      /自分の名前|氏名を答|名前を答|本人の名前/,
    choices: [
      {
        value: "02",
        pattern:
          /自分の名前(?:を)?答えられない|氏名(?:を)?答えられない|名前が分からない|自分が誰か分からない/,
      },
      {
        value: "01",
        pattern:
          /自分の名前(?:を)?答えられる|氏名(?:を)?答えられる|名前を理解している/,
      },
    ],
  },

  {
    rowKey: "cognitive06",
    keywords:
      /季節|春夏秋冬|今の時期|季節感/,
    choices: [
      {
        value: "02",
        pattern:
          /季節(?:を)?理解できない|今の季節が分からない|季節を間違える|季節感がない/,
      },
      {
        value: "01",
        pattern:
          /季節(?:を)?理解できる|今の季節が分かる|季節感がある/,
      },
    ],
  },

  {
    rowKey: "cognitive07",
    keywords:
      /自分のいる場所|現在地|ここがどこ|場所が分か|場所の理解|見当識/,
    choices: [
      {
        value: "02",
        pattern:
          /自分のいる場所(?:が)?分からない|現在地が分からない|ここがどこか分からない|場所の見当識がない|場所を間違える/,
      },
      {
        value: "01",
        pattern:
          /自分のいる場所(?:が)?分かる|現在地を理解している|ここがどこか答えられる|場所の見当識あり/,
      },
    ],
  },

  {
    rowKey: "lifefunction08",
    keywords:
      /徘徊|歩き回る|外へ出ようとする|無断外出/,
    choices: [
      {
        value: "03",
        pattern:
          /徘徊(?:が)?ある|頻繁に徘徊|毎日徘徊|常時歩き回る|無断外出を繰り返す/,
      },
      {
        value: "02",
        pattern:
          /ときどき徘徊|時々歩き回る|たまに外へ出ようとする|徘徊することがある/,
      },
      {
        value: "01",
        pattern:
          /徘徊(?:は|が)?ない|歩き回ることはない|無断外出なし/,
      },
    ],
  },

  {
    rowKey: "lifefunction09",
    keywords:
      /戻れない|迷子|道に迷|帰宅できない|帰り道が分からない/,
    choices: [
      {
        value: "03",
        pattern:
          /外出すると戻れない|頻繁に迷子|一人で帰宅できない|帰り道が分からない/,
      },
      {
        value: "02",
        pattern:
          /ときどき道に迷う|迷子になることがある|時々帰宅できなくなる/,
      },
      {
        value: "01",
        pattern:
          /迷子にならない|一人で帰宅できる|帰り道が分かる|外出後に戻れる/,
      },
    ],
  },

  {
    rowKey: "behavior10_reaction",
    keywords:
      /介護者の発言|話しかけ|声かけへの反応|指示への反応|説明への反応/,
    choices: [
      {
        value: "03",
        pattern:
          /介護者の発言に反応しない|声かけに反応しない|指示を全く理解しない|説明への反応なし/,
      },
      {
        value: "02",
        pattern:
          /ときどき反応しない|反応にむらがある|繰り返し声かけが必要|指示が入りにくい/,
      },
      {
        value: "01",
        pattern:
          /介護者の発言に反応する|声かけに反応する|指示を理解できる|説明を理解する/,
      },
    ],
  },

  {
    rowKey: "behavior17",
    keywords:
      /暴言|暴力|殴る|蹴る|叩く|怒鳴る|攻撃的/,
    choices: [
      {
        value: "03",
        pattern:
          /暴言(?:が)?ある|暴力(?:が)?ある|頻繁に怒鳴る|殴る|蹴る|叩く|攻撃行動/,
      },
      {
        value: "02",
        pattern:
          /ときどき暴言|時々暴力|怒鳴ることがある|興奮時に攻撃的/,
      },
      {
        value: "01",
        pattern:
          /暴言(?:は|が)?ない|暴力(?:は|が)?ない|攻撃行動なし/,
      },
    ],
  },

  {
    rowKey: "behavior18",
    keywords:
      /目的なく動き回る|意味なく歩き回る|落ち着きなく動く|うろうろ/,
    choices: [
      {
        value: "03",
        pattern:
          /頻繁に.*動き回る|常にうろうろ|目的なく動き回る|落ち着きなく歩き続ける/,
      },
      {
        value: "02",
        pattern:
          /ときどき.*動き回る|時々うろうろ|落ち着かないことがある/,
      },
      {
        value: "01",
        pattern:
          /目的なく動き回ることはない|うろうろしない|落ち着いて過ごす/,
      },
    ],
  },

  {
    rowKey: "behavior19",
    keywords:
      /火の始末|火の管理|ガスコンロ|コンロ|火を消し忘|火災/,
    choices: [
      {
        value: "03",
        pattern:
          /火の始末ができない|火を消し忘れる|頻繁にコンロを消し忘れる|火の管理が困難/,
      },
      {
        value: "02",
        pattern:
          /ときどき火を消し忘れる|火の管理に見守り|コンロ使用時に確認が必要/,
      },
      {
        value: "01",
        pattern:
          /火の始末ができる|火の管理に問題なし|コンロを安全に使用/,
      },
    ],
  },

  {
    rowKey: "behavior20",
    keywords:
      /不潔行為|便を触|尿を触|便を塗|排泄物を触|汚物を触/,
    choices: [
      {
        value: "03",
        pattern:
          /不潔行為(?:が)?ある|便を触る|便を塗る|排泄物を触る|汚物をいじる/,
      },
      {
        value: "02",
        pattern:
          /ときどき不潔行為|時々便を触る|不潔行為をすることがある/,
      },
      {
        value: "01",
        pattern:
          /不潔行為(?:は|が)?ない|排泄物を触らない/,
      },
    ],
  },

  {
    rowKey: "behavior21",
    keywords:
      /異食|食べ物でないもの|紙を食べ|土を食べ|洗剤を口に|拾い食い/,
    choices: [
      {
        value: "03",
        pattern:
          /異食(?:が)?ある|食べ物でないものを食べる|紙を食べる|土を食べる|洗剤を口にする/,
      },
      {
        value: "02",
        pattern:
          /ときどき異食|異食することがある|時々拾い食い/,
      },
      {
        value: "01",
        pattern:
          /異食(?:は|が)?ない|食べ物でないものを口にしない/,
      },
    ],
  },

  {
    rowKey: "behavior07",
    keywords:
      /介護に抵抗|介助を拒否|介護拒否|支援を拒否|服薬拒否|入浴拒否/,
    choices: [
      {
        value: "03",
        pattern:
          /介護に抵抗する|介護拒否(?:が)?ある|頻繁に介助を拒否|強く抵抗する/,
      },
      {
        value: "02",
        pattern:
          /ときどき介護を拒否|時々介助を拒否|声かけによって受け入れることがある/,
      },
      {
        value: "01",
        pattern:
          /介護に抵抗しない|介助を受け入れる|介護拒否なし/,
      },
    ],
  },

  {
    rowKey: "behavior10_collect",
    keywords:
      /ものを集める|物を集める|無断で持って|勝手に持って|収集癖|ため込/,
    choices: [
      {
        value: "03",
        pattern:
          /ものを集める行動がある|無断で持ってくる|頻繁に物をため込む|他人の物を持ってくる/,
      },
      {
        value: "02",
        pattern:
          /ときどき物を集める|時々無断で持ってくる|ため込むことがある/,
      },
      {
        value: "01",
        pattern:
          /ものを集める行動はない|無断で持ってこない|収集行動なし/,
      },
    ],
  },
];

function fillElderCareCognitionAndBehaviorAssessments(
  content: Record<string, unknown>,
  sourceText: string | null | undefined,
) {
  const text = String(sourceText ?? "").trim();

  if (!text) {
    return;
  }

  const sentences = splitElderCareSourceText(text);

  for (const rule of ELDER_CARE_COGNITION_RULES) {
    const evidenceSentences = sentences
      .filter((sentence) =>
        testAssessmentPattern(
          rule.keywords,
          sentence,
        ),
      )
      .slice(0, 5);

    if (evidenceSentences.length === 0) {
      continue;
    }

    const evidence = evidenceSentences.join(" / ");

    const matchedChoice = rule.choices.find(
      (choice) =>
        testAssessmentPattern(
          choice.pattern,
          evidence,
        ),
    );

    if (!matchedChoice) {
      continue;
    }

    setRowChoice(
      content,
      "cognition_communication",
      rule.rowKey,
      matchedChoice.value,
      evidence,
    );
  }
}

function splitElderCareSourceText(
  sourceText: string,
): string[] {
  return sourceText
    .split(/[\r\n。！？!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function testAssessmentPattern(
  pattern: RegExp,
  value: string,
): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function preserveElderCareDefaultChoices(
  content: Record<string, unknown>,
) {
  const sheets =
    (
      content as {
        sheets?: Array<{
          rows?: Array<Record<string, unknown>>;
        }>;
      }
    ).sheets ?? [];

  for (const sheet of sheets) {
    for (const row of sheet.rows ?? []) {
      if (row.inputType !== "radio") {
        continue;
      }

      const defaultValue =
        typeof row.defaultValue === "string"
          ? row.defaultValue
          : "";

      if (!defaultValue || defaultValue === "00") {
        continue;
      }

      const currentValue =
        typeof row.value === "string"
          ? row.value.trim()
          : "";

      if (
        currentValue &&
        currentValue !== "00"
      ) {
        continue;
      }

      row.value = defaultValue;
      row.check = "CIRCLE";
    }
  }
}

function fillElderCareBasicInformation(
  content: Record<string, unknown>,
  client: ClientAssessmentSource,
) {
  setRowValue(
    content,
    "basic",
    "client_name",
    client.name ?? "",
  );

  setRowValue(
    content,
    "basic",
    "client_gender",
    normalizeGender(client.gender),
  );

  const birthDate = normalizeDateValue(
    client.birth_yyyy_mm_dd,
  );

  setRowValue(
    content,
    "basic",
    "client_birth_date",
    birthDate,
  );

  setRowValue(
    content,
    "basic",
    "client_age",
    calculateAge(birthDate),
  );

  setRowValue(
    content,
    "basic",
    "client_address",
    client.address ?? "",
  );

  setRowValue(
    content,
    "basic",
    "client_phone",
    client.phone_01 ?? "",
  );

  setRowValue(
    content,
    "basic",
    "client_mobile",
    client.phone_02 ?? "",
  );

  setRowValue(
    content,
    "basic",
    "kaigo_hoken_no",
    client.kaigo_hoken_no ?? "",
  );

  const kaigoPeriod = [
    normalizeDateValue(client.kaigo_start_at),
    normalizeDateValue(client.kaigo_end_at),
  ]
    .filter(Boolean)
    .join(" ～ ");

  setRowValue(
    content,
    "basic",
    "certification_period",
    kaigoPeriod,
  );
}

function normalizeGender(value: string | null | undefined) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  if (
    text === "1" ||
    text === "男性" ||
    text.toLowerCase() === "male"
  ) {
    return "男性";
  }

  if (
    text === "2" ||
    text === "女性" ||
    text.toLowerCase() === "female"
  ) {
    return "女性";
  }

  return text;
}

function normalizeDateValue(
  value: string | null | undefined,
) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const dateMatch = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
  );

  if (!dateMatch) {
    return text;
  }

  const [, year, month, day] = dateMatch;

  return [
    year,
    month.padStart(2, "0"),
    day.padStart(2, "0"),
  ].join("-");
}

function calculateAge(
  birthDate: string,
): string {
  if (!birthDate) {
    return "";
  }

  const birth = new Date(birthDate);

  if (Number.isNaN(birth.getTime())) {
    return "";
  }

  const today = new Date();

  let age =
    today.getFullYear() - birth.getFullYear();

  const birthdayThisYear = new Date(
    today.getFullYear(),
    birth.getMonth(),
    birth.getDate(),
  );

  if (today < birthdayThisYear) {
    age--;
  }

  return String(age);
}

function setRowValue(
  content: Record<string, unknown>,
  sheetKey: string,
  rowKey: string,
  value: string,
) {
  const sheets =
    (
      content as {
        sheets?: Array<{
          key: string;
          rows?: Array<Record<string, unknown>>;
        }>;
      }
    ).sheets ?? [];

  const sheet = sheets.find(
    (currentSheet) => currentSheet.key === sheetKey,
  );

  const row = sheet?.rows?.find(
    (currentRow) => currentRow.key === rowKey,
  );

  if (!row) {
    return;
  }

  row.value = value;

  if (value) {
    row.check = "CIRCLE";
  }
}

function fillElderCareWeeklyServiceSummary(content: Record<string, unknown>, weeklyRows: WeeklyAssessmentSourceRow[]) {
  const homeHelpRows = weeklyRows.filter((row) =>
    /訪問介護|身体介護|生活援助|通院等乗降介助|介護予防|総合事業/.test(rowText(row)),
  );

  if (homeHelpRows.length > 0) {
    setRowRemark(content, "current_services", "home_help_frequency", `週${homeHelpRows.length}回`);
  }

  const otherServices = weeklyRows
    .map((row) => row.plan_display_name ?? row.plan_service_category ?? row.service_code ?? "")
    .filter(Boolean);

  if (otherServices.length > 0) {
    setRowRemark(content, "current_services", "other_services", [...new Set(otherServices)].join(" / "));
  }
}

function rowText(row: WeeklyAssessmentSourceRow) {
  return [
    row.plan_document_kind,
    row.plan_service_category,
    row.plan_display_name,
    row.kaipoke_servicek,
    row.kaipoke_servicecode,
    row.service_code,
  ]
    .filter(Boolean)
    .join(" ");
}

function setRowRemark(content: Record<string, unknown>, sheetKey: string, rowKey: string, remark: string) {
  const sheets = (content as { sheets?: Array<{ key: string; rows?: Array<Record<string, unknown>> }> }).sheets ?? [];
  const sheet = sheets.find((s) => s.key === sheetKey);
  const row = sheet?.rows?.find((r) => r.key === rowKey);
  if (!row) return;
  row.remark = remark;
  if (remark) row.check = "CIRCLE";
}
