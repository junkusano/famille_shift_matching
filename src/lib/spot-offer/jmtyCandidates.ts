export type JmtyRequest = {
  id: string;
  core_id: string | null;
  shift_start_date: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  unit_amount: number | string | null;
  commute_fee: number | string | null;
  jmty_status: string | null;
  sharefull_job_id: string | null;
};

export type JmtyTemplate = {
  core_id: string;
  jmty_template_status: string | null;
  jmty_title: string | null;
  jmty_description: string | null;
  matching_place_name: string | null;
};

export type JmtyCandidate = {
  id: string;
  title: string;
  workplace_summary: string;
  recruitment_summary: string;
  reason: string;
  status: string;
};

function safeTitle(value: string): string {
  return value
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "")
    .replace(/〒?\d{3}-?\d{4}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function workplaceSummary(value: string | null): string {
  if (!value) return "勤務地の詳細は要確認";
  const area = value.match(/(北海道|東京都|(?:京都|大阪)府|.{2,3}県)([^\d０-９\s、,]{1,12}?(?:市|区|町|村))/u);
  return area ? `${area[1]}${area[2]}周辺` : "勤務地の詳細は要確認";
}

function money(value: number | string | null): string | null {
  if (value === null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? `${Math.trunc(amount).toLocaleString("ja-JP")}円` : null;
}

export function buildJmtyCandidates(
  requests: readonly JmtyRequest[],
  templates: readonly JmtyTemplate[],
  today: string,
): JmtyCandidate[] {
  const byCoreId = new Map(templates.map((template) => [template.core_id, template]));
  return requests.flatMap((request) => {
    if (!request.core_id || request.shift_start_date < today || request.sharefull_job_id?.trim()) return [];
    if (request.jmty_status && !["template_review", "ready_for_offer"].includes(request.jmty_status)) return [];

    const template = byCoreId.get(request.core_id);
    if (template?.jmty_template_status !== "ready_for_offer") return [];
    const title = safeTitle(template.jmty_title ?? "");
    // 空の承認フラグや空文面を誤って候補にしない。
    if (!title || !template.jmty_description?.trim()) return [];

    const pay = money(request.unit_amount);
    const commute = money(request.commute_fee);
    const period = [request.shift_start_time, request.shift_end_time].filter(Boolean).join("〜");
    const recruitmentSummary = [request.shift_start_date, period, pay && `支給額 ${pay}`, commute && `交通費 ${commute}`]
      .filter(Boolean)
      .join("｜");

    return [{
      id: request.id,
      title,
      workplace_summary: workplaceSummary(template.matching_place_name),
      recruitment_summary: recruitmentSummary,
      reason: "募集中・勤務日が未来・ジモティー文面承認済み・Sharefull掲載なし",
      status: request.jmty_status === "ready_for_offer"
        ? "掲載準備済み"
        : request.jmty_status === "template_review" ? "確認待ち" : "未掲載",
    }];
  });
}
