// src/lib/assessment/elder-care-template.ts

import type {
  AssessmentContent,
  AssessmentServiceKind,
} from "@/types/assessment";

export type ElderCareAssessmentKind = "要介護" | "要支援";

type CheckValue = "NONE" | "CIRCLE";

type ElderCareInputType =
  | "text"
  | "textarea"
  | "radio"
  | "checkbox"
  | "number"
  | "date";

type ElderCareChoiceOption = {
  value: string;
  label: string;
};

type ElderCareRow = {
  key: string;
  label: string;
  check: CheckValue;
  remark: string;
  hope: string;

  inputType: ElderCareInputType;

  value?: string;
  defaultValue?: string;
  options?: ElderCareChoiceOption[];

  unit?: string;
  placeholder?: string;

  /**
   * カイポケ風画面での表示グループです。
   * 現在の共通画面では使いません。
   */
  group?: string;

  /**
   * 横並び表示などに利用します。
   */
  width?: "full" | "half" | "third" | "quarter";
};

type ElderCareSheet = {
  key: string;
  title: string;
  printTarget: boolean;
  rows: ElderCareRow[];

  /**
   * 次に作成する介護専用フォームが利用します。
   */
  layout:
  | "basic-information"
  | "service-frequency"
  | "housing"
  | "health"
  | "special"
  | "adl"
  | "cognition";
};

function createRow(params: {
  key: string;
  label: string;
  inputType?: ElderCareInputType;
  group?: string;
  width?: ElderCareRow["width"];
  unit?: string;
  placeholder?: string;
}): ElderCareRow {
  return {
    key: params.key,
    label: params.label,
    check: "NONE",
    remark: "",
    hope: "",
    inputType: params.inputType ?? "textarea",
    group: params.group,
    width: params.width ?? "full",
    unit: params.unit,
    placeholder: params.placeholder,
  };
}

function createChoiceRow(params: {
  key: string;
  label: string;
  options: ElderCareChoiceOption[];
  defaultValue?: string;
  group?: string;
  width?: ElderCareRow["width"];
}): ElderCareRow {
  const defaultValue = params.defaultValue ?? "00";

  return {
    key: params.key,
    label: params.label,
    check: defaultValue === "00" ? "NONE" : "CIRCLE",
    remark: "",
    hope: "",
    inputType: "radio",
    value: defaultValue,
    defaultValue,
    options: params.options,
    group: params.group,
    width: params.width ?? "full",
  };
}

/* =========================================================
 * 共通選択肢
 * ======================================================= */

const YES_NO_UNSELECTED_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "有" },
  { value: "02", label: "無" },
];

const REQUIRED_NOT_REQUIRED_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "必要" },
  { value: "02", label: "不要" },
];

const ACCEPTANCE_METHOD_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "訪問" },
  { value: "02", label: "電話" },
  { value: "03", label: "来所" },
  { value: "04", label: "その他" },
];

const ASSESSMENT_REASON_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "初回" },
  { value: "02", label: "更新" },
  { value: "03", label: "区分変更" },
  { value: "04", label: "悪化" },
  { value: "05", label: "改善" },
  { value: "06", label: "退院" },
  { value: "07", label: "退所" },
  { value: "08", label: "その他" },
];

const CARE_LEVEL_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "SUPPORT_1", label: "要支援1" },
  { value: "SUPPORT_2", label: "要支援2" },
  { value: "CARE_1", label: "要介護1" },
  { value: "CARE_2", label: "要介護2" },
  { value: "CARE_3", label: "要介護3" },
  { value: "CARE_4", label: "要介護4" },
  { value: "CARE_5", label: "要介護5" },
];

const BEDRIDDEN_LEVEL_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "INDEPENDENT", label: "自立" },
  { value: "J1", label: "J1" },
  { value: "J2", label: "J2" },
  { value: "A1", label: "A1" },
  { value: "A2", label: "A2" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "C1", label: "C1" },
  { value: "C2", label: "C2" },
];

const DEMENTIA_LEVEL_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "INDEPENDENT", label: "自立" },
  { value: "I", label: "Ⅰ" },
  { value: "IIA", label: "Ⅱa" },
  { value: "IIB", label: "Ⅱb" },
  { value: "IIIA", label: "Ⅲa" },
  { value: "IIIB", label: "Ⅲb" },
  { value: "IV", label: "Ⅳ" },
  { value: "M", label: "M" },
];

const SAME_SEPARATE_HOUSE_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "同居" },
  { value: "02", label: "別居" },
];

const EMPLOYMENT_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "有" },
  { value: "02", label: "無" },
];

const HOME_TYPE_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "一戸建て" },
  { value: "02", label: "集合住宅" },
];

const HOME_OWNERSHIP_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "賃貸" },
  { value: "02", label: "所有" },
  { value: "03", label: "給与住宅" },
  { value: "04", label: "公営住宅" },
  { value: "05", label: "その他" },
];

const TOILET_TYPE_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "洋式" },
  { value: "02", label: "和式" },
  { value: "03", label: "その他" },
];

const BED_TYPE_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "未選択" },
  { value: "01", label: "布団" },
  { value: "02", label: "固定式ベッド" },
  { value: "03", label: "ギャッチベッド" },
  { value: "04", label: "電動ベッド" },
  { value: "05", label: "その他" },
];

/* =========================================================
 * ADL・IADL選択肢
 * ======================================================= */

const TURNING_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.できる" },
  { value: "02", label: "2.何かにつかまればできる" },
  { value: "03", label: "3.できない" },
];

const WASHING_BODY_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.自立" },
  { value: "02", label: "2.一部介助" },
  { value: "03", label: "3.全介助" },
  { value: "04", label: "4.行っていない" },
];

const FOUR_LEVEL_SUPPORT_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.自立" },
  { value: "02", label: "2.見守り等" },
  { value: "03", label: "3.一部介助" },
  { value: "04", label: "4.全介助" },
];

const THREE_LEVEL_SUPPORT_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.自立" },
  { value: "02", label: "2.一部介助" },
  { value: "03", label: "3.全介助" },
];

/* =========================================================
 * 認知・行動選択肢
 * ======================================================= */

const COMMUNICATION_ABILITY_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.できる" },
  { value: "02", label: "2.ときどき伝達できる" },
  { value: "03", label: "3.ほとんどできない" },
  { value: "04", label: "4.できない" },
];

const CAN_OR_CANNOT_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.できる" },
  { value: "02", label: "2.できない" },
];

const BEHAVIOR_FREQUENCY_OPTIONS: ElderCareChoiceOption[] = [
  { value: "00", label: "0.未選択" },
  { value: "01", label: "1.ない" },
  { value: "02", label: "2.ときどきある" },
  { value: "03", label: "3.ある" },
];

/* =========================================================
 * バリデーション
 * ======================================================= */

function assertElderCareKind(
  serviceKind: AssessmentServiceKind | ElderCareAssessmentKind,
): asserts serviceKind is ElderCareAssessmentKind {
  if (serviceKind !== "要介護" && serviceKind !== "要支援") {
    throw new Error(
      `介護保険アセスメント対象外です: ${serviceKind}`,
    );
  }
}

/* =========================================================
 * テンプレート
 * ======================================================= */

export function getDefaultElderCareAssessmentContent(
  serviceKind: AssessmentServiceKind | ElderCareAssessmentKind,
): AssessmentContent {
  assertElderCareKind(serviceKind);

  const sheets: ElderCareSheet[] = [
    {
      key: "basic",
      title: "基本情報",
      printTarget: true,
      layout: "basic-information",
      rows: [
        createRow({
          key: "acceptance_date",
          label: "受付日",
          inputType: "date",
          group: "reception",
          width: "half",
        }),
        createChoiceRow({
          key: "acceptance_method",
          label: "受付方法",
          options: ACCEPTANCE_METHOD_OPTIONS,
          defaultValue: "00",
          group: "reception",
          width: "half",
        }),
        createRow({
          key: "acceptance_method_other",
          label: "受付方法（その他）",
          inputType: "text",
          group: "reception",
          width: "half",
        }),
        createRow({
          key: "consultation_acceptance_person",
          label: "相談受付者",
          inputType: "text",
          group: "reception",
          width: "half",
        }),

        createRow({
          key: "client_name",
          label: "本人氏名",
          inputType: "text",
          group: "client",
          width: "half",
        }),
        createRow({
          key: "client_gender",
          label: "性別",
          inputType: "text",
          group: "client",
          width: "quarter",
        }),
        createRow({
          key: "client_age",
          label: "年齢",
          inputType: "text",
          group: "client",
          width: "quarter",
        }),
        createRow({
          key: "client_birth_date",
          label: "生年月日",
          inputType: "date",
          group: "client",
          width: "half",
        }),
        createRow({
          key: "client_address",
          label: "住所",
          inputType: "textarea",
          group: "client",
          width: "full",
        }),
        createRow({
          key: "client_phone",
          label: "電話番号",
          inputType: "text",
          group: "client",
          width: "half",
        }),
        createRow({
          key: "client_mobile",
          label: "携帯電話番号",
          inputType: "text",
          group: "client",
          width: "half",
        }),

        createRow({
          key: "kaigo_hoken_no",
          label: "介護保険被保険者番号",
          inputType: "text",
          group: "certification",
          width: "half",
        }),

        createChoiceRow({
          key: "assessment_reason",
          label: "アセスメントの理由",
          options: ASSESSMENT_REASON_OPTIONS,
          defaultValue: "00",
          group: "assessment",
        }),
        createRow({
          key: "assessment_reason_other",
          label: "アセスメントの理由（その他）",
          inputType: "text",
          group: "assessment",
        }),

        createChoiceRow({
          key: "care_level",
          label: "要介護認定",
          options: CARE_LEVEL_OPTIONS,
          defaultValue: "00",
          group: "certification",
        }),
        createRow({
          key: "certification_date",
          label: "認定日",
          inputType: "date",
          group: "certification",
          width: "half",
        }),
        createRow({
          key: "certification_period",
          label: "認定有効期間",
          inputType: "text",
          group: "certification",
          width: "half",
        }),

        createChoiceRow({
          key: "bedridden_level",
          label: "障害高齢者の日常生活自立度",
          options: BEDRIDDEN_LEVEL_OPTIONS,
          defaultValue: "00",
          group: "independence",
        }),
        createChoiceRow({
          key: "dementia_level",
          label: "認知症高齢者の日常生活自立度",
          options: DEMENTIA_LEVEL_OPTIONS,
          defaultValue: "00",
          group: "independence",
        }),

        createRow({
          key: "family_1_name",
          label: "家族1 氏名",
          inputType: "text",
          group: "family_1",
          width: "half",
        }),
        createRow({
          key: "family_1_relation",
          label: "家族1 続柄",
          inputType: "text",
          group: "family_1",
          width: "quarter",
        }),
        createChoiceRow({
          key: "family_1_house",
          label: "家族1 同別居",
          options: SAME_SEPARATE_HOUSE_OPTIONS,
          group: "family_1",
          width: "quarter",
        }),
        createChoiceRow({
          key: "family_1_job",
          label: "家族1 職の有無",
          options: EMPLOYMENT_OPTIONS,
          group: "family_1",
          width: "quarter",
        }),
        createRow({
          key: "family_1_health",
          label: "家族1 健康状態",
          inputType: "text",
          group: "family_1",
          width: "quarter",
        }),
        createRow({
          key: "family_1_note",
          label: "家族1 特記事項",
          group: "family_1",
          width: "half",
        }),

        createRow({
          key: "family_2_name",
          label: "家族2 氏名",
          inputType: "text",
          group: "family_2",
          width: "half",
        }),
        createRow({
          key: "family_2_relation",
          label: "家族2 続柄",
          inputType: "text",
          group: "family_2",
          width: "quarter",
        }),
        createChoiceRow({
          key: "family_2_house",
          label: "家族2 同別居",
          options: SAME_SEPARATE_HOUSE_OPTIONS,
          group: "family_2",
          width: "quarter",
        }),
        createChoiceRow({
          key: "family_2_job",
          label: "家族2 職の有無",
          options: EMPLOYMENT_OPTIONS,
          group: "family_2",
          width: "quarter",
        }),
        createRow({
          key: "family_2_health",
          label: "家族2 健康状態",
          inputType: "text",
          group: "family_2",
          width: "quarter",
        }),
        createRow({
          key: "family_2_note",
          label: "家族2 特記事項",
          group: "family_2",
          width: "half",
        }),

        createRow({
          key: "living_situation",
          label: "生活状況",
          group: "consultation",
          width: "half",
        }),
        createRow({
          key: "person_hope",
          label: "相談内容（本人）",
          group: "consultation",
          width: "half",
        }),
        createRow({
          key: "family_hope",
          label: "相談内容（家族および介護者）",
          group: "consultation",
          width: "half",
        }),
        createRow({
          key: "assessment_date",
          label: "アセスメント実施日",
          inputType: "date",
          group: "assessment",
          width: "half",
        }),
      ],
    },

    {
      key: "current_services",
      title: "現在利用しているサービスの状況",
      printTarget: true,
      layout: "service-frequency",
      rows: [
        createRow({
          key: "home_help_frequency",
          label: "（介護予防）訪問介護",
          inputType: "number",
          unit: "回／月",
          group: "home_service",
          width: "half",
        }),
        createRow({
          key: "home_bath_frequency",
          label: "（介護予防）訪問入浴介護",
          inputType: "number",
          unit: "回／月",
          group: "home_service",
          width: "half",
        }),
        createRow({
          key: "visit_nursing_frequency",
          label: "（介護予防）訪問看護",
          inputType: "number",
          unit: "回／月",
          group: "home_service",
          width: "half",
        }),
        createRow({
          key: "visit_rehabilitation_frequency",
          label: "（介護予防）訪問リハビリテーション",
          inputType: "number",
          unit: "回／月",
          group: "home_service",
          width: "half",
        }),
        createRow({
          key: "home_medical_management_frequency",
          label: "（介護予防）居宅療養管理指導",
          inputType: "number",
          unit: "回／月",
          group: "home_service",
          width: "half",
        }),
        createRow({
          key: "day_service_frequency",
          label: "（介護予防）通所介護",
          inputType: "number",
          unit: "回／月",
          group: "day_service",
          width: "half",
        }),
        createRow({
          key: "day_care_frequency",
          label: "（介護予防）通所リハビリテーション",
          inputType: "number",
          unit: "回／月",
          group: "day_service",
          width: "half",
        }),
        createRow({
          key: "short_stay_life_frequency",
          label: "短期入所生活介護",
          inputType: "number",
          unit: "日／月",
          group: "short_stay",
          width: "half",
        }),
        createRow({
          key: "short_stay_medical_frequency",
          label: "短期入所療養介護",
          inputType: "number",
          unit: "日／月",
          group: "short_stay",
          width: "half",
        }),
        createRow({
          key: "welfare_equipment_count",
          label: "（介護予防）福祉用具貸与",
          inputType: "number",
          unit: "品目",
          group: "equipment",
          width: "half",
        }),
        createChoiceRow({
          key: "home_renovation",
          label: "住宅改修",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "equipment",
          width: "half",
        }),
        createRow({
          key: "other_services",
          label: "その他利用サービス",
          group: "other",
        }),
      ],
    },

    {
      key: "housing",
      title: "住居等の状況",
      printTarget: true,
      layout: "housing",
      rows: [
        createChoiceRow({
          key: "home_type",
          label: "住居形態",
          options: HOME_TYPE_OPTIONS,
          group: "home",
          width: "half",
        }),
        createChoiceRow({
          key: "home_ownership",
          label: "賃貸・所有等",
          options: HOME_OWNERSHIP_OPTIONS,
          group: "home",
          width: "half",
        }),
        createChoiceRow({
          key: "private_room",
          label: "専用居室",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "room",
          width: "half",
        }),
        createChoiceRow({
          key: "bed_type",
          label: "寝具",
          options: BED_TYPE_OPTIONS,
          group: "room",
          width: "half",
        }),
        createRow({
          key: "room_floor",
          label: "居室の階",
          inputType: "number",
          unit: "階",
          group: "room",
          width: "quarter",
        }),
        createChoiceRow({
          key: "elevator",
          label: "エレベーター",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "room",
          width: "quarter",
        }),

        createChoiceRow({
          key: "toilet_type",
          label: "トイレ形式",
          options: TOILET_TYPE_OPTIONS,
          group: "toilet",
          width: "half",
        }),
        createChoiceRow({
          key: "toilet_handrail",
          label: "トイレの手すり",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "toilet",
          width: "quarter",
        }),
        createChoiceRow({
          key: "toilet_step",
          label: "トイレまでの段差",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "toilet",
          width: "quarter",
        }),

        createChoiceRow({
          key: "bath_exists",
          label: "浴室",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "bath",
          width: "half",
        }),
        createChoiceRow({
          key: "bath_handrail",
          label: "浴室の手すり",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "bath",
          width: "quarter",
        }),
        createChoiceRow({
          key: "bath_step",
          label: "浴室までの段差",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "bath",
          width: "quarter",
        }),

        createRow({
          key: "moving_tools_outdoor",
          label: "移動手段（室外）",
          group: "movement",
          width: "half",
          placeholder: "車いす、杖、歩行器など",
        }),
        createRow({
          key: "moving_tools_indoor",
          label: "移動手段（室内）",
          group: "movement",
          width: "half",
          placeholder: "車いす、杖、歩行器など",
        }),

        createChoiceRow({
          key: "washing_machine",
          label: "洗濯機",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "equipment",
          width: "third",
        }),
        createChoiceRow({
          key: "water_heater",
          label: "湯沸器",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "equipment",
          width: "third",
        }),
        createChoiceRow({
          key: "refrigerator",
          label: "冷蔵庫",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "equipment",
          width: "third",
        }),
        createRow({
          key: "housing_note",
          label: "住環境に関する特記事項",
          group: "note",
        }),
      ],
    },

    {
      key: "health",
      title: "健康状態",
      printTarget: true,
      layout: "health",
      rows: [
        createRow({
          key: "medical_history",
          label: "既往歴・現症",
          group: "medical_history",
        }),
        createRow({
          key: "height",
          label: "身長",
          inputType: "number",
          unit: "cm",
          group: "body",
          width: "half",
        }),
        createRow({
          key: "weight",
          label: "体重",
          inputType: "number",
          unit: "kg",
          group: "body",
          width: "half",
        }),
        createRow({
          key: "tooth_status",
          label: "歯の状況",
          group: "oral",
        }),
        createChoiceRow({
          key: "skin_pressure_ulcer",
          label: "じょくそう・皮膚の対応",
          options: REQUIRED_NOT_REQUIRED_OPTIONS,
          group: "skin",
        }),
        createRow({
          key: "health_special_note",
          label: "健康状態に関する特記事項",
          group: "skin",
        }),

        createRow({
          key: "doctor_opinion_mobility",
          label: "介護に関する医師の意見（移動）",
          group: "doctor_opinion",
        }),
        createRow({
          key: "doctor_opinion_nutrition",
          label: "介護に関する医師の意見（栄養・食生活）",
          group: "doctor_opinion",
        }),
        createRow({
          key: "risk_and_policy",
          label:
            "現在あるか、または今後発生の可能性が高い状態と対処方針",
          group: "risk",
        }),
        createChoiceRow({
          key: "life_function_outlook",
          label: "サービス利用による生活機能の維持・改善の見通し",
          options: [
            { value: "00", label: "未選択" },
            { value: "01", label: "期待できる" },
            { value: "02", label: "期待できない" },
            { value: "03", label: "不明" },
          ],
          group: "outlook",
        }),
        createRow({
          key: "medical_management_need",
          label: "医学的管理の必要性",
          group: "medical_management",
        }),
        createRow({
          key: "medical_caution",
          label:
            "サービス提供時における医学的観点からの留意事項",
          group: "medical_caution",
        }),
        createChoiceRow({
          key: "infection",
          label: "感染症の有無",
          options: [
            { value: "00", label: "未選択" },
            { value: "01", label: "有" },
            { value: "02", label: "無" },
            { value: "03", label: "不明" },
          ],
          group: "infection",
        }),
        createRow({
          key: "infection_detail",
          label: "感染症の詳細",
          inputType: "text",
          group: "infection",
        }),
      ],
    },

    {
      key: "special",
      title: "特別な状況",
      printTarget: true,
      layout: "special",
      rows: [
        createRow({
          key: "summary",
          label: "まとめ内容",
          group: "summary",
        }),
        createChoiceRow({
          key: "safety_necessity",
          label: "安全確保への対応の必要性",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "necessity",
          width: "half",
        }),
        createChoiceRow({
          key: "rights_protection_necessity",
          label: "権利擁護に関する対応への必要性",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "necessity",
          width: "half",
        }),
        createChoiceRow({
          key: "home_modification_need",
          label: "住宅改修の必要性",
          options: YES_NO_UNSELECTED_OPTIONS,
          group: "necessity",
          width: "half",
        }),
      ],
    },

    {
      key: "adl_iadl",
      title: "ADL/IADL",
      printTarget: true,
      layout: "adl",
      rows: [
        createChoiceRow({
          key: "mobable03",
          label: "1-3 寝返り",
          options: TURNING_OPTIONS,
          defaultValue: "01",
          group: "bath",
        }),
        createChoiceRow({
          key: "mobable04",
          label: "1-4 起き上がり",
          options: TURNING_OPTIONS,
          defaultValue: "01",
          group: "bath",
        }),
        createChoiceRow({
          key: "mobable07",
          label: "1-7 歩行",
          options: TURNING_OPTIONS,
          defaultValue: "01",
          group: "bath",
        }),
        createChoiceRow({
          key: "mobable10",
          label: "1-10 洗身",
          options: WASHING_BODY_OPTIONS,
          defaultValue: "01",
          group: "bath",
        }),
        createRow({
          key: "bath_note",
          label: "入浴に関して【特記、解決すべき課題など】",
          group: "bath",
        }),

        createChoiceRow({
          key: "lifefunction01_1",
          label: "2-1 移乗",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "movement_meal",
        }),
        createChoiceRow({
          key: "lifefunction04_1",
          label: "2-4 食事摂取",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "movement_meal",
        }),
        createChoiceRow({
          key: "lifefunction05_1",
          label: "2-5 排尿",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "toileting",
        }),
        createChoiceRow({
          key: "lifefunction06_1",
          label: "2-6 排便",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "toileting",
        }),
        createChoiceRow({
          key: "lifefunction07_1",
          label: "2-7 口腔衛生",
          options: THREE_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "clean_clothing",
        }),
        createChoiceRow({
          key: "lifefunction10_1",
          label: "2-10 上衣の着脱",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "clean_clothing",
        }),
        createChoiceRow({
          key: "lifefunction11",
          label: "2-11 ズボン等の着脱",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "clean_clothing",
        }),
        createRow({
          key: "move_meal_note",
          label:
            "歩行・移動・食事に関して【特記、解決すべき課題など】",
          group: "movement_meal",
        }),
        createRow({
          key: "toilet_clean_cloth_note",
          label:
            "排泄・清潔・更衣に関して【特記、解決すべき課題など】",
          group: "toileting",
        }),

        createChoiceRow({
          key: "rd51",
          label: "5-1 薬の内服",
          options: THREE_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "iadl",
        }),
        createChoiceRow({
          key: "rd52",
          label: "5-2 金銭の管理",
          options: THREE_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "iadl",
        }),
        createChoiceRow({
          key: "rd55",
          label: "5-5 買い物",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "iadl",
        }),
        createChoiceRow({
          key: "rd56",
          label: "5-6 簡単な調理",
          options: FOUR_LEVEL_SUPPORT_OPTIONS,
          defaultValue: "01",
          group: "iadl",
        }),
      ],
    },

    {
      key: "cognition_communication",
      title: "認知・コミュニケーション能力",
      printTarget: true,
      layout: "cognition",
      rows: [
        createChoiceRow({
          key: "cognitive01",
          label: "3-1 意思の伝達",
          options: COMMUNICATION_ABILITY_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive02",
          label: "3-2 毎日の日課を理解する",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive03",
          label: "3-3 生年月日や年齢を答える",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive04",
          label: "3-4 面接調査の直前記憶",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive05",
          label: "3-5 自分の名前を答える",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive06",
          label: "3-6 今の季節を理解する",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createChoiceRow({
          key: "cognitive07",
          label: "3-7 自分のいる場所を答える",
          options: CAN_OR_CANNOT_OPTIONS,
          defaultValue: "01",
          group: "cognition",
        }),
        createRow({
          key: "cognition_note",
          label:
            "認知機能に関して【特記、解決すべき課題など】",
          group: "cognition",
        }),

        createChoiceRow({
          key: "lifefunction08",
          label: "3-8 徘徊",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "lifefunction09",
          label: "3-9 外出すると戻れない（迷子）",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior10_reaction",
          label: "3-10 介護者の発言への反応",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior17",
          label: "4-17 暴言・暴力",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior18",
          label: "4-18 目的なく動き回る",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior19",
          label: "4-19 火の始末・管理",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior20",
          label: "4-20 不潔行為",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior21",
          label: "4-21 異食行動",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior07",
          label: "4-7 介護に抵抗する",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),
        createChoiceRow({
          key: "behavior10_collect",
          label: "4-10 ものを集める、無断でもってくる",
          options: BEHAVIOR_FREQUENCY_OPTIONS,
          defaultValue: "01",
          group: "behavior",
        }),

        createRow({
          key: "communication_method",
          label: "コミュニケーションの状況・方法",
          group: "communication",
        }),
        createRow({
          key: "communication_note",
          label:
            "コミュニケーションの状況・方法に関して【特記、解決すべき課題など】",
          group: "communication",
        }),
        createRow({
          key: "social_activity",
          label: "社会活動の状況",
          group: "social",
        }),
        createRow({
          key: "social_note",
          label:
            "社会との関わりに関して【特記、解決すべき課題など】",
          group: "social",
        }),
      ],
    },
  ];

  return {
    version: 2,
    template: "elder-care-kaipoke-required-v2",
    service_kind: serviceKind,
    sheets,
  } as unknown as AssessmentContent;
}