// src/lib/assessment/elder-care-template.ts
import type { AssessmentContent, AssessmentServiceKind } from "@/types/assessment";

export type ElderCareAssessmentKind = "要介護" | "要支援";

type CheckValue = "NONE" | "CIRCLE";
type ChoiceValue = "00" | "01" | "02" | "03" | "04";

type ElderCareChoiceOption = {
  value: ChoiceValue;
  label: string;
};

type ElderCareRow = {
  key: string;
  label: string;
  check: CheckValue;
  remark: string;
  hope: string;
  inputType?: "text" | "textarea" | "radio";
  value?: ChoiceValue | string;
  defaultValue?: ChoiceValue | string;
  options?: ElderCareChoiceOption[];
};

function row(key: string, label: string, inputType: "text" | "textarea" = "textarea"): ElderCareRow {
  return { key, label, check: "NONE", remark: "", hope: "", inputType };
}

function choiceRow(
  key: string,
  label: string,
  options: ElderCareChoiceOption[],
  defaultValue: ChoiceValue = "01",
): ElderCareRow {
  return {
    key,
    label,
    check: "CIRCLE",
    remark: "",
    hope: "",
    inputType: "radio",
    value: defaultValue,
    defaultValue,
    options,
  };
}

const CAN_DO_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.できる" },
  { value: "02", label: "2.何かにつかまればできる" },
  { value: "03", label: "3.できない" },
];

const SELF_SUPPORT_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.自立" },
  { value: "02", label: "2.見守り等" },
  { value: "03", label: "3.一部介助" },
  { value: "04", label: "4.全介助" },
];

const NONE_SOMETIMES_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.ない" },
  { value: "02", label: "2.ときどきある" },
  { value: "03", label: "3.ある" },
];

function assertElderCareKind(serviceKind: AssessmentServiceKind | ElderCareAssessmentKind) {
  if (serviceKind !== "要介護" && serviceKind !== "要支援") {
    throw new Error(`介護保険アセスメント対象外です: ${serviceKind}`);
  }
}

export function getDefaultElderCareAssessmentContent(
  serviceKind: AssessmentServiceKind | ElderCareAssessmentKind,
): AssessmentContent {
  assertElderCareKind(serviceKind);

  return {
    version: 1,
    template: "elder-care-kaipoke-required-v1",
    service_kind: serviceKind,
    sheets: [
      {
        key: "basic",
        title: "基本情報",
        printTarget: true,
        rows: [
          row("acceptance_date", "受付日", "text"),
          row("acceptance_method", "受付方法", "text"),
          row("consultation_acceptance_person", "相談受付者", "text"),
          row("assessment_reason", "アセスメントの理由", "text"),
          row("certification_status", "要介護認定", "text"),
          row("living_situation", "生活状況"),
          row("person_hope", "相談内容（本人）"),
          row("family_hope", "相談内容（家族および介護者）"),
          row("family_caregiver", "家族・主たる介護者"),
          row("daily_independence", "日常生活自立度"),
        ],
      },
      {
        key: "current_services",
        title: "現在利用しているサービスの状況",
        printTarget: true,
        rows: [
          row("home_help_frequency", "（介護予防）訪問介護 月回数", "text"),
          row("home_bath_frequency", "（介護予防）訪問入浴介護 月回数", "text"),
          row("visit_nursing_frequency", "（介護予防）訪問看護 月回数", "text"),
          row("day_service_frequency", "（介護予防）通所介護 月回数", "text"),
          row("day_care_frequency", "（介護予防）通所リハビリテーション 月回数", "text"),
          row("short_stay_frequency", "短期入所 月日数", "text"),
          row("welfare_equipment", "（介護予防）福祉用具貸与", "text"),
          row("home_renovation", "住宅改修", "text"),
          row("other_services", "その他利用サービス"),
        ],
      },
      {
        key: "housing",
        title: "住居等の状況",
        printTarget: true,
        rows: [
          row("home_type", "住居形態", "text"),
          row("home_ownership", "賃貸・所有等", "text"),
          row("room_status", "居室等の状況"),
          row("toilet_status", "トイレ"),
          row("bath_status", "浴室"),
          row("moving_tools_outdoor", "移動手段（室外）"),
          row("moving_tools_indoor", "移動手段（室内）"),
          row("home_equipment", "諸設備"),
        ],
      },
      {
        key: "health",
        title: "健康状態",
        printTarget: true,
        rows: [
          row("medical_history", "既往歴・現症"),
          row("height_weight", "身長・体重", "text"),
          row("tooth_status", "歯の状況", "text"),
          row("skin_pressure_ulcer", "じょくそう・皮膚の対応", "text"),
          row("doctor_opinion_mobility", "介護に関する医師の意見（移動）"),
          row("doctor_opinion_nutrition", "介護に関する医師の意見（栄養・食生活）"),
          row("risk_and_policy", "現在あるかまたは今後発生の可能性の高い状態と対処方針"),
          row("life_function_outlook", "サービス利用による生活機能の維持・改善の見通し", "text"),
          row("medical_management_need", "医学的管理の必要性"),
          row("medical_caution", "サービス提供時における医学的観点からの留意事項"),
          row("infection", "感染症の有無", "text"),
        ],
      },
      {
        key: "special",
        title: "特別な状況",
        printTarget: true,
        rows: [
          row("summary", "まとめ内容"),
          row("safety_necessity", "安全確保への対応の必要性", "text"),
          row("rights_protection_necessity", "権利擁護に関する対応への必要性", "text"),
          row("home_modification_need", "住宅改修の必要性", "text"),
        ],
      },
      {
        key: "adl_iadl",
        title: "ADL/IADL",
        printTarget: true,
        rows: [
          choiceRow("mobable03", "1-3 寝返り", CAN_DO_OPTIONS, "01"),
          choiceRow("mobable04", "1-4 起き上がり", CAN_DO_OPTIONS, "01"),
          choiceRow("mobable07", "1-7 歩行", CAN_DO_OPTIONS, "01"),
          choiceRow("mobable10", "1-10 洗身", SELF_SUPPORT_OPTIONS, "01"),
          row("bath_note", "入浴に関して【特記、解決すべき課題など】"),
          choiceRow("lifefunction01_1", "2-1 移乗", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction04_1", "2-4 食事摂取", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction05_1", "2-5 排尿", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction06_1", "2-6 排便", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction07_1", "2-7 口腔衛生", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction10_1", "2-10 上衣の着脱", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("lifefunction11", "2-11 ズボン等の着脱", SELF_SUPPORT_OPTIONS, "01"),
          row("move_meal_note", "歩行・移動・食事に関して【特記、解決すべき課題など】"),
          row("toilet_clean_cloth_note", "排泄・清潔・更衣に関して【特記、解決すべき課題など】"),
          choiceRow("rd51", "5-1 薬の内服", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("rd52", "5-2 金銭の管理", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("rd55", "5-5 買い物", SELF_SUPPORT_OPTIONS, "01"),
          choiceRow("rd56", "5-6 簡単な調理", SELF_SUPPORT_OPTIONS, "01"),
        ],
      },
      {
        key: "cognition_communication",
        title: "認知・コミュニケーション能力",
        printTarget: true,
        rows: [
          choiceRow("cognitive01", "3-1 意思の伝達", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive02", "3-2 毎日の日課を理解する", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive03", "3-3 生年月日や年齢を答える", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive04", "3-4 面接調査の直前記憶", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive05", "3-5 自分の名前を答える", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive06", "3-6 今の季節を理解する", CAN_DO_OPTIONS, "01"),
          choiceRow("cognitive07", "3-7 自分のいる場所を答える", CAN_DO_OPTIONS, "01"),
          row("cognition_note", "認知機能に関して【特記、解決すべき課題など】"),
          choiceRow("lifefunction08", "3-8 徘徊", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("lifefunction09", "3-9 外出すると戻れない（迷子）", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior10_reaction", "3-10 介護者の発言への反応", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior17", "4-17 暴言・暴力", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior18", "4-18 目的なく動き回る", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior19", "4-19 火の始末・管理", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior20", "4-20 不潔行為", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior21", "4-21 異食行動", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior07", "4-7 介護に抵抗する", NONE_SOMETIMES_OPTIONS, "01"),
          choiceRow("behavior10_collect", "4-10 ものを集める、無断でもってくる", NONE_SOMETIMES_OPTIONS, "01"),
          row("communication_method", "コミュニケーションの状況・方法"),
          row("communication_note", "コミュニケーションの状況・方法に関して【特記、解決すべき課題など】"),
          row("social_activity", "社会活動の状況"),
          row("social_note", "社会との関わりに関して【特記、解決すべき課題など】"),
        ],
      },
    ],
  } as AssessmentContent;
}
