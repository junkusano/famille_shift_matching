// src/app/api/plans/[id]/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { google } from "googleapis";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFICE_NAME = "ファミーユヘルパーサービス愛知";
const DEFAULT_DRIVE_FOLDER_ID = "1N1EIT1escqpNREOfwc70YgBC8JVu78j2";
const PLAN_PDF_DRIVE_FOLDER_ID =
  process.env.PLAN_PDF_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID;

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

type Ctx = {
  params: Promise<{ id: string }>;
};

type PlanRow = {
  plan_id: string;
  assessment_id: string;
  client_info_id: string | null;
  kaipoke_cs_id: string;
  plan_document_kind: string;
  title: string;
  version_no: number;
  status: string;
  issued_on: string | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  author_name: string | null;
  person_family_hope: string | null;
  assistance_goal: string | null;
  remarks: string | null;
  weekly_plan_comment: string | null;
  monthly_summary: unknown;
  created_at: string;
};

type ServiceRow = {
  plan_service_id: string;
  service_code: string | null;
  plan_service_category: string | null;
  service_title: string | null;
  service_detail: string | null;
  procedure_notes: string | null;
  observation_points: string | null;
  family_action: string | null;
  schedule_note: string | null;
  weekday: number | null;
  weekday_jp: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  monthly_hours: number | string | null;
  display_order: number;
  service_no: number;
  two_person_work_flg: boolean;
  active: boolean;
};

type ClientLike = Record<string, unknown> | null;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    await getUserFromBearer(req);

    const { id } = await params;

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("plan_id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return json({ ok: false, error: "plan not found" }, 404);
    }

    const { data: services, error: servicesError } = await supabaseAdmin
      .from("plan_services")
      .select("*")
      .eq("plan_id", id)
      .eq("active", true)
      .order("service_no", { ascending: true })
      .order("display_order", { ascending: true })
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (servicesError) throw servicesError;

    const { data: client } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("*")
      .eq("id", plan.client_info_id)
      .maybeSingle();

    const html = buildPlanHtml({
      plan: plan as PlanRow,
      services: groupServicesForPdf((services ?? []) as ServiceRow[]),
      rawServices: (services ?? []) as ServiceRow[],
      client: client as ClientLike,
    });

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 1200,
        height: 1700,
      },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "9mm",
        bottom: "10mm",
        left: "9mm",
      },
    });

    await browser.close();
    browser = null;

    const fileName = buildPdfFileName(plan as PlanRow);

    const uploaded = await uploadPdfBufferToGoogleDrive({
      buffer: Buffer.from(pdfBuffer),
      filename: fileName,
    });

    const { error: updateError } = await supabaseAdmin
      .from("plans")
      .update({
        pdf_file_url: uploaded.url,
        pdf_generated_at: new Date().toISOString(),
        status: "pdf_generated",
      })
      .eq("plan_id", plan.plan_id);

    if (updateError) throw updateError;

    return json({
      ok: true,
      plan_id: plan.plan_id,
      pdf_file_url: uploaded.url,
      drive_file_id: uploaded.fileId,
      filename: fileName,
    });
  } catch (e: unknown) {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/plans/[id]/pdf][POST] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}

async function uploadPdfBufferToGoogleDrive(params: {
  buffer: Buffer;
  filename: string;
}): Promise<{
  fileId: string;
  url: string;
  mimeType: string | null;
}> {
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountRaw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(serviceAccountRaw),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  const uploadRes = await drive.files.create({
    requestBody: {
      name: params.filename,
      parents: [PLAN_PDF_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType: "application/pdf",
      body: bufferToStream(params.buffer),
    },
    supportsAllDrives: true,
    fields: "id,name,mimeType",
  });

  const fileId = uploadRes.data.id;

  if (!fileId) {
    throw new Error("Google Drive upload failed: fileId missing");
  }

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
      allowFileDiscovery: false,
    },
    supportsAllDrives: true,
  });

  const url = `https://drive.google.com/uc?export=view&id=${fileId}`;

  return {
    fileId,
    url,
    mimeType: uploadRes.data.mimeType ?? "application/pdf",
  };
}

function buildPlanHtml(params: {
  plan: PlanRow;
  services: ServiceRow[];
  rawServices: ServiceRow[];
  client: ClientLike;
}) {
  const { plan, services, rawServices, client } = params;

  const monthlySummary = normalizeMonthlySummary(plan.monthly_summary);
  const title =
    plan.plan_document_kind === "移動支援サービス"
      ? "移動支援サービス計画書"
      : "居宅介護等計画書";

  const clientName = getClientName(client);
  const birthday = getFirstString(client, [
    "birthday",
    "birth_date",
    "date_of_birth",
    "birth",
  ]);
  const address = getClientAddress(client);
  const tel = getFirstString(client, ["tel", "phone", "phone_number", "mobile"]);
  const fax = getFirstString(client, ["fax"]);

  const createDate = formatDate(plan.plan_start_date);
  const issuedOn = formatDate(plan.issued_on);
  const period =
    plan.plan_start_date || plan.plan_end_date
      ? `${formatDate(plan.plan_start_date)} - ${formatDate(plan.plan_end_date)}`
      : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: "Noto Sans JP", "Yu Gothic", "YuGothic", "Meiryo", sans-serif;
    color: #111;
    font-size: 10.5px;
    line-height: 1.45;
  }

  .page {
    page-break-after: always;
    width: 100%;
  }

  .page:last-child {
    page-break-after: auto;
  }

  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .title {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 4px 0 8px;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border: 1px solid #111;
    padding: 4px 5px;
    vertical-align: top;
  }

  th {
    background: #f1f1f1;
    text-align: center;
    font-weight: 700;
    white-space: nowrap;
  }

  .no-border {
    border: none;
  }

  .center {
    text-align: center;
  }

  .right {
    text-align: right;
  }

  .bold {
    font-weight: 700;
  }

  .small {
    font-size: 9.5px;
  }

  .hope-box {
    min-height: 58px;
    white-space: pre-wrap;
  }

  .goal-box {
    min-height: 58px;
    white-space: pre-wrap;
  }

  .remarks-box {
    min-height: 42px;
    white-space: pre-wrap;
  }

  .service-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px 12px;
  }

  .schedule th,
  .schedule td {
    height: 27px;
    text-align: center;
  }

  .schedule td {
    font-size: 9.5px;
  }

  .signature {
    display: grid;
    grid-template-columns: 90px 150px 110px 1fr;
    border: 1px solid #111;
    border-top: none;
    min-height: 44px;
  }

  .signature > div {
    border-right: 1px solid #111;
    padding: 8px 6px;
  }

  .signature > div:last-child {
    border-right: none;
  }

  .section-title {
    font-weight: 700;
    font-size: 13px;
    margin: 10px 0 4px;
  }

  .detail-table th,
  .detail-table td {
    height: 42px;
  }

  .detail-table td {
    white-space: pre-wrap;
  }

  .vertical-service {
    width: 60px;
    text-align: center;
    font-weight: 700;
  }

  .nowrap {
    white-space: nowrap;
  }

  .footer-note {
    margin-top: 6px;
    font-size: 9.5px;
  }

  @media print {
    .page {
      page-break-after: always;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="top-row">
      <div>作成日　${esc(createDate)}</div>
      <div class="right">作成者　${esc(plan.author_name ?? "")}</div>
    </div>

    <div class="title">${esc(title)}</div>

    <table>
      <tbody>
        <tr>
          <th style="width: 16%;">利用者名</th>
          <td style="width: 22%;">${esc(clientName)}</td>
          <th style="width: 16%;">生年月日</th>
          <td style="width: 18%;">${esc(birthday)}</td>
          <th style="width: 12%;">連絡先</th>
          <td style="width: 16%;">TEL: ${esc(tel)}<br/>FAX: ${esc(fax)}</td>
        </tr>
        <tr>
          <th>住所</th>
          <td colspan="5">${esc(address)}</td>
        </tr>
        <tr>
          <th>事業所名</th>
          <td colspan="5">${esc(OFFICE_NAME)}</td>
        </tr>
      </tbody>
    </table>

    <table style="margin-top: 6px;">
      <tbody>
        <tr>
          <th style="width: 18%;">本人(家族)の希望</th>
          <td class="hope-box">${esc(plan.person_family_hope ?? "")}</td>
        </tr>
        <tr>
          <th>援助目標</th>
          <td class="goal-box">${esc(plan.assistance_goal ?? "")}</td>
        </tr>
        <tr>
          <th>備考</th>
          <td class="remarks-box">${esc(plan.remarks ?? "")}</td>
        </tr>
      </tbody>
    </table>

    <table style="margin-top: 6px;">
      <tbody>
        <tr>
          <th style="width: 18%;">サービス内容</th>
          <td>
            <div class="service-summary-grid">
              ${monthlySummary.length
      ? monthlySummary
        .map(
          (m) =>
            `<div>${esc(m.checked)}${esc(m.category)} ${esc(
              m.monthlyHours,
            )}時間</div>`,
        )
        .join("")
      : `<div>□身体　時間</div><div>□家事　時間</div><div>□通院(伴う)　時間</div>`}
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">【計画予定表】</div>

    <table class="schedule">
      <thead>
        <tr>
          <th style="width: 9%;">時間</th>
          <th>月</th>
          <th>火</th>
          <th>水</th>
          <th>木</th>
          <th>金</th>
          <th>土</th>
          <th>日</th>
          <th style="width: 18%;">備考</th>
        </tr>
      </thead>
      <tbody>
        ${buildScheduleRows(rawServices, plan.weekly_plan_comment)}
      </tbody>
    </table>

    <div class="signature">
      <div class="bold center">交付日</div>
      <div class="center">${esc(issuedOn)}</div>
      <div class="bold center">利用者サイン</div>
      <div>&nbsp;</div>
    </div>

    <div class="footer-note">
      計画期間　${esc(period)}
    </div>
  </div>

  <div class="page">
    <div class="section-title">
      【サービス内容】以下の方法で、居宅介護等サービスを提供していきます。
    </div>

    <table>
      <tbody>
        <tr>
          <th style="width: 12%;">種類等</th>
          <td>
            ${monthlySummary
      .map(
        (m) =>
          `<span style="margin-right: 18px;">${esc(m.checked)}${esc(
            m.category,
          )}（${esc(m.monthlyHours)}時間）</span>`,
      )
      .join("")}
          </td>
        </tr>
      </tbody>
    </table>

    <table class="detail-table" style="margin-top: 6px;">
      <thead>
        <tr>
          <th style="width: 10%;">サービス</th>
          <th style="width: 15%;">所要時間</th>
          <th style="width: 22%;">サービスの内容</th>
          <th style="width: 31%;">手順・留意事項・観察ポイント</th>
          <th style="width: 22%;">本人・家族にやっていただくこと</th>
        </tr>
      </thead>
      <tbody>
        ${services.length
      ? services.map((s, idx) => buildServiceDetailRow(s, idx)).join("")
      : `<tr><th>サービス1</th><td></td><td></td><td></td><td></td></tr>`
    }
        ${buildEmptyRows(Math.max(0, 7 - services.length))}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function buildScheduleRows(services: ServiceRow[], weeklyComment: string | null) {
  const slots = [
    "2:00",
    "4:00",
    "6:00",
    "8:00",
    "10:00",
    "12:00",
    "14:00",
    "16:00",
    "18:00",
    "20:00",
    "22:00",
    "24:00",
  ];

  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

  return slots
    .map((slot, idx) => {
      const cells = weekdays
        .map((w) => {
          const text = services
            .filter((s) => s.weekday_jp === w)
            .filter((s) => isSameSlot(s.start_time, slot))
            .map(
              (s) =>
                s.plan_service_category ||
                s.service_title ||
                s.service_code ||
                "",
            )
            .filter(Boolean)
            .join(" / ");

          return `<td>${esc(text)}</td>`;
        })
        .join("");

      return `<tr>
        <th>${esc(slot)}</th>
        ${cells}
        <td>${idx === 0 ? esc(weeklyComment ?? "") : ""}</td>
      </tr>`;
    })
    .join("");
}

function buildServiceDetailRow(s: ServiceRow, idx: number) {
  const timeText = [
    s.duration_minutes ? `${s.duration_minutes}分` : "",
    `${s.weekday_jp ? `${s.weekday_jp} ` : ""}${shortTime(
      s.start_time,
    )}${s.start_time || s.end_time ? " - " : ""}${shortTime(s.end_time)}`,
  ]
    .filter(Boolean)
    .join("<br/>");

  const procedure = s.procedure_notes || s.observation_points || "";

  return `<tr>
    <th>サービス${idx + 1}</th>
    <td class="nowrap">${timeText}</td>
    <td>${esc(s.service_detail || s.service_title || s.service_code || "")}</td>
    <td>${esc(procedure)}</td>
    <td>${esc(s.family_action ?? "")}</td>
  </tr>`;
}

function buildEmptyRows(count: number) {
  return Array.from({ length: count })
    .map(
      () =>
        `<tr><th>&nbsp;</th><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`,
    )
    .join("");
}

function normalizeMonthlySummary(v: unknown): Array<{
  category: string;
  monthlyHours: string;
  checked: string;
}> {
  if (!Array.isArray(v)) return [];

  return v.map((x) => {
    const obj = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const category =
      typeof obj.category === "string" && obj.category.trim()
        ? obj.category.trim()
        : "未分類";

    const rawHours = obj.monthly_hours;
    const monthlyHours =
      rawHours === null || rawHours === undefined
        ? ""
        : String(rawHours);

    return {
      category,
      monthlyHours,
      checked: "■",
    };
  });
}

function groupServicesForPdf(services: ServiceRow[]): ServiceRow[] {
  const map = new Map<string, ServiceRow>();

  for (const s of services) {
    const key = [
      s.start_time ?? "",
      s.end_time ?? "",
      s.duration_minutes ?? "",
      s.service_title ?? "",
      s.service_detail ?? "",
      s.procedure_notes ?? "",
      s.observation_points ?? "",
      s.family_action ?? "",
      s.schedule_note ?? "",
      s.plan_service_category ?? "",
    ].join("|");

    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        ...s,
        weekday_jp: s.weekday_jp ?? "",
      });
      continue;
    }

    const weekdays = new Set(
      [
        ...(existing.weekday_jp ?? "").split("・").filter(Boolean),
        s.weekday_jp ?? "",
      ].filter(Boolean),
    );

    existing.weekday_jp = sortWeekdays([...weekdays]).join("・");
  }

  return [...map.values()].sort((a, b) => {
    const aTime = `${a.start_time ?? ""}-${a.end_time ?? ""}`;
    const bTime = `${b.start_time ?? ""}-${b.end_time ?? ""}`;
    return aTime.localeCompare(bTime);
  });
}

function sortWeekdays(days: string[]): string[] {
  const order = ["月", "火", "水", "木", "金", "土", "日"];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function getClientName(client: ClientLike) {
  return (
    getFirstString(client, ["name", "client_name", "cs_name", "display_name"]) ||
    ""
  );
}

function getClientAddress(client: ClientLike) {
  if (!client) return "";

  const zip = getFirstString(client, ["postal_code", "zip", "zipcode"]);
  const pref = getFirstString(client, ["prefecture"]);
  const address1 = getFirstString(client, ["address", "address1", "addr1"]);
  const address2 = getFirstString(client, ["address2", "addr2"]);
  const address3 = getFirstString(client, ["address3", "addr3"]);

  const parts = [
    zip ? `〒${zip}` : "",
    pref,
    address1,
    address2,
    address3,
  ].filter(Boolean);

  return parts.join(" ");
}

function getFirstString(client: ClientLike, keys: string[]) {
  if (!client) return "";

  for (const key of keys) {
    const v = client[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }

  return "";
}

function buildPdfFileName(plan: PlanRow) {
  const date = plan.plan_start_date || new Date().toISOString().slice(0, 10);
  const safeKind = plan.plan_document_kind.replace(/[^\p{L}\p{N}_-]/gu, "");
  return `${date}_${safeKind}_${plan.kaipoke_cs_id}_${plan.plan_id}.pdf`;
}

function formatDate(v: string | null | undefined) {
  if (!v) return "";
  return v;
}

function shortTime(v: string | null) {
  if (!v) return "";
  return v.slice(0, 5);
}

function isSameSlot(startTime: string | null, slot: string) {
  if (!startTime) return false;
  const hour = Number(startTime.slice(0, 2));
  const slotHour = Number(slot.split(":")[0]);
  if (!Number.isFinite(hour) || !Number.isFinite(slotHour)) return false;
  return hour >= slotHour && hour < slotHour + 2;
}

function esc(v: unknown) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}