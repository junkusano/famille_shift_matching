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

    // 介護保険。サービスコードだけの行でも拾えるように、介護保険でよく使う訪問介護系の語を広めに見る。
    if (/要介護|介護保険|訪問介護|身体介護|生活援助|通院等乗降介助|訪介|ホームヘルプ|総合事業/.test(text)) {
      kinds.add("要介護");
    }

    if (/要支援|介護予防|予防訪問|予防専門型|生活支援型/.test(text)) {
      kinds.add("要支援");
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
    fillElderCareWeeklyServiceSummary(content, relevantWeeklyRows);
  }

  return content as AssessmentContent;
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
