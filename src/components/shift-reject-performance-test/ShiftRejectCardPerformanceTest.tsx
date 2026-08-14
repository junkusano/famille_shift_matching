"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import {
  CalendarDays,
  CarFront,
  Clock3,
  FileText,
  MapPin,
  MessageSquareText,
  Route,
  UserRound,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import DocUploader, { type DocItem } from "@/components/DocUploader";
import ShiftRecordLinkButton from "@/components/shift/ShiftRecordLinkButton";
import GroupAddButtonPerformanceTest from "@/components/shift-coordinate-performance-test/GroupAddButtonPerformanceTest";
import { supabase } from "@/lib/supabaseClient";
import type { ServiceKey } from "@/lib/certificateJudge";
import type {
  RejectPerformanceShift,
  RejectPerformanceStaffRow,
} from "@/types/shiftRejectPerformanceTest";

type Props = {
  shift: RejectPerformanceShift;
  staffMap: Record<string, RejectPerformanceStaffRow>;
  myServiceKeys: ServiceKey[] | null;
  userRole: string | null;
  accountId: string;
  onReject: (shift: RejectPerformanceShift, reason: string) => Promise<boolean>;
};

type ParkingPlace = {
  id: string;
  serial: number;
  label: string;
  location_link: string | null;
  parking_orientation: string | null;
  remarks: string | null;
  permit_required: boolean | null;
  police_station_place_id: string | null;
  picture1_url?: string | null;
  picture2_url?: string | null;
};

const SMS_DEFAULT_HEADER =
  "ファミーユヘルパーサービス愛知からのSMSです。\n" +
  "※このSMSは送信専用です。返信いただいても確認できません。";
const MEAL_EXPENSE_REQUEST_TYPE_ID = "ceb95336-89c1-4030-a46f-e7acbbc8d901";
const parkingCache = new Map<string, ParkingPlace[]>();
const parkingPromiseCache = new Map<string, Promise<ParkingPlace[]>>();

function formatShiftDate(date?: string | null) {
  if (!date) return "日付未定";
  try {
    return format(parseISO(date), "M/d（E）", { locale: ja });
  } catch {
    return date;
  }
}

function formatShiftTime(time?: string | null) {
  return time?.slice(0, 5) || "--:--";
}

function formatName(row?: RejectPerformanceStaffRow) {
  if (!row) return "—";
  return `${row.last_name_kanji ?? ""} ${row.first_name_kanji ?? ""}`.trim() || row.user_id;
}

function isEligibleForService(shift: RejectPerformanceShift, myServiceKeys: ServiceKey[] | null) {
  const required = shift.require_doc_group?.trim() ?? "";
  if (!required || myServiceKeys === null) return true;
  if (myServiceKeys.includes(required as ServiceKey)) return true;
  return (
    required === "移動支援" &&
    myServiceKeys.includes("家事・身体・移動支援" as ServiceKey)
  );
}

function recordButtonClass(shift: RejectPerformanceShift) {
  const startIso = `${shift.shift_start_date}T${formatShiftTime(shift.shift_start_time)}:00`;
  const isPast = new Date(startIso).getTime() < Date.now();
  const status = shift.record_status;
  const isGreen = status === "submitted" || status === "approved" || status === "archived";
  if (status !== "submitted" && isPast) return "bg-red-600 text-white hover:bg-red-700";
  if (isGreen) return "bg-green-600 text-white hover:bg-green-700";
  return "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200";
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url);
}

function getDriveFileId(url: string) {
  const match = url.match(/\/d\/([^/]+)/) ?? url.match(/[?&]id=([^&]+)/);
  return match?.[1] ?? null;
}

function isGoogleDriveUrl(url: string) {
  return /drive\.google\.com/i.test(url);
}

function toDrivePreviewUrl(url: string) {
  const id = getDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

async function fetchParkingPlaces(csId: string, accessToken?: string, forceRefresh = false) {
  if (forceRefresh) {
    parkingCache.delete(csId);
    parkingPromiseCache.delete(csId);
  }
  const cached = parkingCache.get(csId);
  if (cached) return cached;
  const inflight = parkingPromiseCache.get(csId);
  if (inflight) return inflight;

  const promise = (async () => {
    const response = await fetch(
      `/api/parking/cs_places/by-client?cs_id=${encodeURIComponent(csId)}`,
      {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; rows?: ParkingPlace[]; message?: string }
      | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.message || "駐車情報の取得に失敗しました");
    }
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    parkingCache.set(csId, rows);
    return rows;
  })();

  parkingPromiseCache.set(csId, promise);
  try {
    return await promise;
  } finally {
    parkingPromiseCache.delete(csId);
  }
}

function AttachmentPreview({ url, label }: { url: string; label: string }) {
  if (isGoogleDriveUrl(url)) {
    return (
      <div className="mt-2">
        <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
          {label}を開く
        </a>
        <iframe
          src={toDrivePreviewUrl(url) ?? undefined}
          className="mt-2 h-[360px] w-full rounded-lg border"
          title={label}
        />
      </div>
    );
  }
  if (isImageUrl(url)) {
    return (
      <div className="mt-2">
        <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
          {label}を別タブで開く
        </a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="mt-2 max-h-[360px] w-full rounded-lg border object-contain"
        />
      </div>
    );
  }
  if (isPdfUrl(url)) {
    return (
      <div className="mt-2">
        <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
          {label}のPDFを開く
        </a>
        <iframe src={url} className="mt-2 h-[360px] w-full rounded-lg border" title={label} />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-blue-700 underline">
      {label}を開く
    </a>
  );
}

function EstimatedPayLine({ amount }: { amount?: number | null }) {
  if (typeof amount !== "number") return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
      <span className="text-xs font-semibold tracking-wide text-emerald-900">概算給与</span>
      <span className="text-lg font-bold tabular-nums text-emerald-800 sm:text-xl">
        {amount.toLocaleString()}<span className="ml-0.5 text-sm">円</span>
      </span>
    </div>
  );
}

function ShiftRejectCardPerformanceTest({
  shift,
  staffMap,
  myServiceKeys,
  userRole,
  accountId,
  onReject,
}: Props) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [parkingPlaces, setParkingPlaces] = useState<ParkingPlace[]>([]);
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingSendingId, setParkingSendingId] = useState<string | null>(null);
  const [parkingError, setParkingError] = useState<string | null>(null);
  const [mealExpenseOpen, setMealExpenseOpen] = useState(false);
  const [mealExpenseAmount, setMealExpenseAmount] = useState("");
  const [mealExpenseDocuments, setMealExpenseDocuments] = useState<DocItem[]>([]);
  const [mealExpenseRequested, setMealExpenseRequested] = useState(
    Boolean(shift.meal_expense_requested),
  );
  const [mealExpenseSubmitting, setMealExpenseSubmitting] = useState(false);

  const eligible = useMemo(
    () => isEligibleForService(shift, myServiceKeys),
    [shift, myServiceKeys],
  );
  const fullAddress = shift.address?.trim() ?? "";
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;
  const routeParts = [shift.standard_route, shift.standard_trans_ways, shift.standard_purpose]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const routeText = routeParts.length ? routeParts.join(" / ") : "—";
  const hasDetails = Boolean(
    shift.biko?.trim() ||
      shift.basic_information?.trim() ||
      shift.shift_detail_information?.trim(),
  );
  const yearMonth = shift.shift_start_date.slice(0, 7);
  const monthlyHref = `/portal/shift-view?client=${encodeURIComponent(
    shift.kaipoke_cs_id,
  )}&date=${encodeURIComponent(yearMonth)}-01`;

  const sendSms = async () => {
    const phone = shift.sms_phone_number?.trim();
    if (!phone || !smsBody.trim()) return;
    setSmsSending(true);
    setSmsError(null);
    setSmsSent(false);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          items: [
            {
              phone,
              body: `${SMS_DEFAULT_HEADER}\n\n${smsBody.trim()}`,
              shift_id: String(shift.shift_id),
              kaipoke_cs_id: shift.kaipoke_cs_id,
            },
          ],
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || payload?.message || "SMS送信に失敗しました。");
      }
      setSmsBody("");
      setSmsSent(true);
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : "SMS送信に失敗しました。");
    } finally {
      setSmsSending(false);
    }
  };

  const openParkingDialog = async () => {
    setParkingOpen(true);
    setParkingError(null);
    if (parkingPlaces.length) return;
    setParkingLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      setParkingPlaces(await fetchParkingPlaces(shift.kaipoke_cs_id, accessToken, true));
    } catch (error) {
      setParkingError(error instanceof Error ? error.message : "駐車情報の取得に失敗しました");
    } finally {
      setParkingLoading(false);
    }
  };

  const applyParkingPermit = async (placeId: string) => {
    if (!window.confirm("「許可証申請」メッセージを送信します。よろしいですか？")) return;
    setParkingSendingId(placeId);
    setParkingError(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const response = await fetch("/api/parking/permit-apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ parking_cs_place_id: placeId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message || "許可証申請の送信に失敗しました");
      }
      alert("送信しました。");
    } catch (error) {
      setParkingError(error instanceof Error ? error.message : "送信に失敗しました");
    } finally {
      setParkingSendingId(null);
    }
  };

  const submitMealExpense = async () => {
    if (mealExpenseSubmitting) return;
    const amount = Number(mealExpenseAmount);
    const receipts = mealExpenseDocuments.filter((document) => document.url?.trim());
    if (!Number.isInteger(amount) || amount <= 0) {
      alert("申請金額を入力してください。");
      return;
    }
    if (!receipts.length) {
      alert("領収書画像をアップロードしてください。");
      return;
    }
    if (!accountId) {
      alert("申請者のユーザーIDを確認できませんでした。");
      return;
    }

    setMealExpenseSubmitting(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("wf_request")
        .select("id")
        .eq("request_type_id", MEAL_EXPENSE_REQUEST_TYPE_ID)
        .contains("payload", { kind: "meal_expense", shift_id: String(shift.shift_id) })
        .limit(1);
      if (existingError) throw existingError;
      if ((existing?.length ?? 0) > 0) {
        setMealExpenseRequested(true);
        setMealExpenseOpen(false);
        alert("このシフトは既に食事代申請済みです。");
        return;
      }

      const amountLabel = amount.toLocaleString();
      const { error: insertError } = await supabase.from("wf_request").insert({
        request_type_id: MEAL_EXPENSE_REQUEST_TYPE_ID,
        applicant_user_id: accountId,
        title: "食事代申請",
        body: `シフトID：${shift.shift_id}\n申請金額：${amountLabel}円`,
        payload: {
          kind: "meal_expense",
          shift_id: String(shift.shift_id),
          kaipoke_cs_id: shift.kaipoke_cs_id || null,
          shift_start_date: shift.shift_start_date || null,
          shift_start_time: shift.shift_start_time || null,
          shift_end_time: shift.shift_end_time || null,
          client_name: shift.client_name || null,
          amount,
          receipts,
        },
        status: "submitted",
        submitted_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;

      setMealExpenseRequested(true);
      setMealExpenseOpen(false);
      setMealExpenseAmount("");
      setMealExpenseDocuments([]);
      alert("食事代を申請しました。");
    } catch (error) {
      console.error("[shift-reject-performance-test][meal-expense]", error);
      alert(error instanceof Error ? error.message : "食事代申請の保存に失敗しました。");
    } finally {
      setMealExpenseSubmitting(false);
    }
  };

  const submitReject = async () => {
    const reason = rejectReason.trim();
    if (!reason || rejecting) return;
    setRejecting(true);
    try {
      const succeeded = await onReject(shift, reason);
      if (succeeded) {
        setRejectReason("");
        setRejectOpen(false);
      }
    } finally {
      setRejecting(false);
    }
  };

  return (
    <Card
      className={[
        "group h-full overflow-hidden border-slate-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-purple-200",
        !eligible ? "bg-slate-50" : "",
        eligible && shift.time_adjustable ? "border-pink-300 bg-pink-50/70 ring-1 ring-pink-200" : "",
      ].join(" ")}
      style={!eligible ? { opacity: 0.78, filter: "grayscale(0.08)" } : undefined}
    >
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-purple-100 bg-purple-50 px-2.5 py-1.5 text-base font-bold tracking-tight text-purple-950">
              <CalendarDays className="h-4 w-4 shrink-0 text-purple-600" aria-hidden="true" />
              <span className="truncate">{formatShiftDate(shift.shift_start_date)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              <Clock3 className="h-5 w-5 shrink-0 text-purple-600" aria-hidden="true" />
              <span className="tabular-nums">
                {formatShiftTime(shift.shift_start_time)}
                <span className="mx-1 text-slate-400">-</span>
                {formatShiftTime(shift.shift_end_time)}
              </span>
            </div>
          </div>
          {shift.time_adjustable && (
            <span className="shrink-0 rounded-full border border-pink-300 bg-pink-100 px-2 py-1 text-[11px] font-semibold text-pink-950">
              {shift.time_adjust_text || "時間調整可能"}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-600">種別</span>
          <span className="min-w-0 break-words font-semibold text-slate-800">{shift.service_code || "—"}</span>
        </div>

        <EstimatedPayLine amount={shift.estimated_pay_amount} />

        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-start gap-2 text-sm text-slate-700">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1 break-words">
              <span className="mr-1 text-xs font-semibold text-slate-500">利用者</span>
              <span className="font-semibold text-slate-950">{shift.client_name || "—"}</span> 様
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-slate-700">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1 break-words">
              <span className="mr-1 text-xs font-semibold text-slate-500">住所</span>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline underline-offset-2"
                  title="Googleマップで開く"
                >
                  {fullAddress}
                </a>
              ) : (
                "—"
              )}
              {shift.postal_code && <span className="ml-2">（{shift.postal_code}）</span>}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-slate-700">
            <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" aria-hidden="true" />
            <div>
              <span className="mr-1 text-xs font-semibold text-slate-500">性別条件</span>
              <span
                className={
                  shift.gender_request_name === "男性希望"
                    ? "text-blue-700"
                    : shift.gender_request_name === "女性希望"
                      ? "text-rose-700"
                      : ""
                }
              >
                {shift.gender_request_name || "男女問わず"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-slate-700">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="mr-1 text-xs font-semibold text-slate-500">必要資格</span>
              {shift.require_doc_group || "資格指定なし"}
              {!eligible && (
                <p className="mt-1 text-xs font-semibold text-red-700">
                  保有資格では対象外の可能性があります。マネジャーへ確認してください。
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500">担当スタッフ</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{formatName(staffMap[shift.staff_01_user_id ?? ""])}</span>
            <span>{formatName(staffMap[shift.staff_02_user_id ?? ""])}</span>
            <span>{formatName(staffMap[shift.staff_03_user_id ?? ""])}</span>
          </div>
          {shift.spot_offer_status === "確定" && (
            <div className="mt-2 inline-flex flex-col rounded-lg bg-yellow-100 px-2 py-1 text-xs text-slate-900">
              <span className="font-semibold">スポット確定</span>
              <span>{shift.applicant_name || "—"}（{shift.applicant_sex || "—"}）</span>
              {(userRole === "admin" || userRole === "manager") && shift.applicant_control_url && (
                <a
                  href={shift.applicant_control_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  管理画面
                </a>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {shift.commuting_flg && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white">
                  <Route className="h-4 w-4" /> 通所・通学
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-32px)] sm:max-w-[560px]">
                <DialogTitle>通所・通学</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm text-slate-700">
                    <strong>標準経路 / 移動方法 / 訪問目的</strong>
                    <p className="whitespace-pre-wrap break-words">{routeText}</p>
                  </div>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}

          {hasDetails && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white">
                  <FileText className="h-4 w-4" /> 詳細情報
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] w-[calc(100vw-32px)] overflow-hidden sm:max-w-[680px]">
                <DialogTitle>利用者・シフト詳細情報</DialogTitle>
                <DialogDescription asChild>
                  <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2 text-sm text-slate-700">
                    {shift.biko?.trim() && (
                      <section>
                        <strong className="block text-base text-slate-950">備考</strong>
                        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{shift.biko}</p>
                      </section>
                    )}
                    {shift.basic_information?.trim() && (
                      <section className="border-t pt-4">
                        <strong className="block text-base text-slate-950">基本情報</strong>
                        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{shift.basic_information}</p>
                      </section>
                    )}
                    {shift.shift_detail_information?.trim() && (
                      <section className="border-t pt-4">
                        <strong className="block text-base text-slate-950">シフト詳細情報</strong>
                        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{shift.shift_detail_information}</p>
                      </section>
                    )}
                  </div>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}

          {shift.has_active_parking && (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              onClick={() => void openParkingDialog()}
            >
              <CarFront className="h-4 w-4" /> 駐車
            </Button>
          )}
        </div>

        <div className="mt-auto grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-purple-600 text-white hover:bg-purple-700">
                このシフトに入れない
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-32px)] sm:max-w-[480px]">
              <DialogTitle>シフトに入れない</DialogTitle>
              <DialogDescription asChild>
                <div className="text-sm text-slate-700">
                  {shift.client_name} 様のシフトを外します。理由を入力してください。
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="シフトに入れない理由"
                    className="mt-3 min-h-28 w-full rounded-lg border p-3"
                  />
                </div>
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectOpen(false)}>キャンセル</Button>
                <Button
                  disabled={!rejectReason.trim() || rejecting}
                  onClick={() => void submitReject()}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  {rejecting ? "処理中..." : "処理実行を確定"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="hidden w-full"
            disabled={!shift.sms_phone_number}
            onClick={() => {
              setSmsError(null);
              setSmsSent(false);
              setSmsOpen(true);
            }}
          >
            <MessageSquareText className="h-4 w-4" /> 利用者様へSMS
          </Button>

          {mealExpenseRequested ? (
            <div className="flex min-h-9 items-center justify-center rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              ✓ 食事代申請済み
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setMealExpenseOpen(true)}>
              <Utensils className="h-4 w-4" /> 食事代申請
            </Button>
          )}

          <ShiftRecordLinkButton
            className={`w-full ${recordButtonClass(shift)}`}
            shiftId={String(shift.shift_id)}
            clientName={shift.client_name}
            tokuteiComment={shift.tokutei_comment}
            standardRoute={shift.standard_route}
            standardTransWays={shift.standard_trans_ways}
            standardPurpose={shift.standard_purpose}
            kodoengoPlanLink={shift.kodoengo_plan_link}
            staff01UserId={shift.staff_01_user_id}
            staff02UserId={shift.staff_02_user_id}
            staff03UserId={shift.staff_03_user_id}
            staff02AttendFlg={shift.staff_02_attend_flg}
            staff03AttendFlg={shift.staff_03_attend_flg}
            judoIdo={shift.judo_ido}
          />

          <Button variant="secondary" asChild className="w-full">
            <Link href={monthlyHref}>月間</Link>
          </Button>

          <div className="[&>button]:w-full">
            <GroupAddButtonPerformanceTest shift={shift} />
          </div>
        </div>

        <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
          <DialogContent className="w-[calc(100vw-32px)] sm:max-w-[560px]">
            <DialogTitle>利用者様へSMS送信</DialogTitle>
            <DialogDescription>登録されている利用者様の電話番号へSMSを送信します。</DialogDescription>
            <div className="space-y-3 text-sm">
              <div><strong>送信先</strong><div>{shift.sms_phone_number || "電話番号未登録"}</div></div>
              <div>
                <strong>固定文</strong>
                <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3">{SMS_DEFAULT_HEADER}</div>
              </div>
              <label className="block">
                <strong>本文</strong>
                <textarea
                  value={smsBody}
                  onChange={(event) => setSmsBody(event.target.value)}
                  placeholder="利用者様へ送る内容を入力してください"
                  rows={6}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
              <div>
                <strong>送信内容プレビュー</strong>
                <div className="mt-1 whitespace-pre-wrap rounded-lg border p-3">
                  {SMS_DEFAULT_HEADER}{smsBody.trim() ? `\n\n${smsBody.trim()}` : ""}
                </div>
              </div>
              {smsError && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-red-700">{smsError}</div>}
              {smsSent && <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-green-700">SMSを送信しました。</div>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSmsOpen(false)}>閉じる</Button>
              <Button disabled={smsSending || !smsBody.trim()} onClick={() => void sendSms()}>
                {smsSending ? "送信中..." : "SMSを送信"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={mealExpenseOpen} onOpenChange={setMealExpenseOpen}>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-32px)] overflow-y-auto sm:max-w-[700px]">
            <DialogTitle>食事代申請</DialogTitle>
            <DialogDescription>食事代の金額と領収書画像を登録してください。</DialogDescription>
            <label className="block text-sm font-medium">
              申請金額
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={mealExpenseAmount}
                  onChange={(event) => setMealExpenseAmount(event.target.value.replace(/\D/g, ""))}
                  placeholder="例：500"
                  className="w-40 rounded-md border px-3 py-2"
                />
                円
              </span>
            </label>
            <DocUploader
              title="食事代領収書"
              value={mealExpenseDocuments}
              onChange={setMealExpenseDocuments}
              docMaster={{ meal_expense: ["食事代領収書"] }}
              docCategory="meal_expense"
              uploadApiPath="/api/upload/meal-cost"
              showPlaceholders
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMealExpenseOpen(false)}>閉じる</Button>
              <Button
                disabled={
                  mealExpenseSubmitting ||
                  !mealExpenseAmount ||
                  Number(mealExpenseAmount) <= 0 ||
                  !mealExpenseDocuments.some((document) => document.url)
                }
                onClick={() => void submitMealExpense()}
              >
                {mealExpenseSubmitting ? "申請中..." : "食事代を申請"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={parkingOpen} onOpenChange={setParkingOpen}>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-32px)] overflow-y-auto sm:max-w-[760px]">
            <DialogTitle>駐車情報</DialogTitle>
            <DialogDescription>駐車場所を確認し、必要な場所は許可証申請を送信できます。</DialogDescription>
            {parkingError && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800">{parkingError}</div>}
            {parkingLoading ? (
              <div className="text-sm text-slate-600">読み込み中...</div>
            ) : parkingPlaces.length === 0 ? (
              <div className="text-sm text-slate-600">有効な駐車情報がありません。</div>
            ) : (
              <div className="space-y-4">
                {parkingPlaces.map((place) => (
                  <article key={place.id} className="rounded-xl border bg-white p-3 shadow-sm">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div className="font-semibold text-slate-950">
                        {place.police_station_place_id ? `認識コード：${place.police_station_place_id} / ` : ""}
                        {place.serial}. {place.label}
                      </div>
                      {place.permit_required ? (
                        <Button
                          className="bg-amber-500 text-white hover:bg-amber-600"
                          disabled={parkingSendingId !== null}
                          onClick={() => void applyParkingPermit(place.id)}
                        >
                          {parkingSendingId === place.id ? "送信中..." : "許可証申請"}
                        </Button>
                      ) : (
                        <span className="rounded-md border px-2 py-1 text-xs text-slate-600">許可証不要</span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div><strong>向き</strong><div>{place.parking_orientation || "—"}</div></div>
                      <div><strong>備考</strong><div className="whitespace-pre-wrap">{place.remarks || "—"}</div></div>
                    </div>
                    {place.location_link && <AttachmentPreview url={place.location_link} label="地図" />}
                    {[place.picture1_url, place.picture2_url]
                      .filter((value): value is string => Boolean(value))
                      .map((url, index) => <AttachmentPreview key={url} url={url} label={`添付${index + 1}`} />)}
                  </article>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default memo(ShiftRejectCardPerformanceTest);
