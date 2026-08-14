"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarDays, Clock3, MapPin, MessageSquareText, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import type { ServiceKey } from "@/lib/certificateJudge";
import type { ShiftData } from "@/types/shift";

type StaffRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  level_sort: number | null;
};

type Props = {
  shift: ShiftData;
  staffMap: Record<string, StaffRow>;
  myServiceKeys: ServiceKey[] | null;
  userRole: string | null;
  creatingRequest?: boolean;
  onRequest?: (attendRequest: boolean, timeAdjustNote?: string) => void;
  extraActions?: React.ReactNode;
  showSms?: boolean;
};

type UnknownRecord = Record<string, unknown>;

const SMS_DEFAULT_HEADER =
  "ファミーユヘルパーサービス愛知からのSMSです。\n" +
  "※このSMSは送信専用です。返信いただいても確認できません。";

const DEFAULT_BADGE_TEXT = "時間調整可能";

function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as UnknownRecord)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function getStringArray(obj: unknown, key: string): string[] {
  if (!obj || typeof obj !== "object") return [];
  const value = (obj as UnknownRecord)[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
}

function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y", "on", "可", "ok"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off", "", "不可", "ng"].includes(normalized)) return false;
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) return parsed !== 0;
  }
  return undefined;
}

function formatName(row?: StaffRow) {
  if (!row) return "—";
  return `${row.last_name_kanji ?? ""} ${row.first_name_kanji ?? ""}`.trim() || row.user_id;
}

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

function isHiddenRequestShift(shift: ShiftData) {
  const csId = String(shift.kaipoke_cs_id ?? "");
  const service = shift.service_code ?? "";
  return csId.startsWith("999999999") || service === "その他" || service.includes("キャンセル");
}

function isEligibleForService(shift: ShiftData, myServiceKeys: ServiceKey[] | null) {
  const key = getString(shift, "require_doc_group") ?? "";
  if (!key) return true;
  if (myServiceKeys === null) return true;
  if (myServiceKeys.includes(key as ServiceKey)) return true;
  if (key === "移動支援" && myServiceKeys.includes("家事・身体・移動支援" as ServiceKey)) return true;
  return false;
}

function EstimatedPayLine({ amount }: { amount?: number | null }) {
  if (typeof amount !== "number") return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
      <span className="text-xs font-semibold tracking-wide text-emerald-900">概算給与</span>
      <span className="text-lg font-bold tabular-nums text-emerald-800 sm:text-xl">
        {amount.toLocaleString()}
        <span className="ml-0.5 text-sm font-semibold">円</span>
      </span>
    </div>
  );
}

export default function ShiftCardPerformanceTest({
  shift,
  staffMap,
  myServiceKeys,
  userRole,
  creatingRequest,
  onRequest,
  extraActions,
  showSms = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [timeAdjustNote, setTimeAdjustNote] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState(false);

  const eligible = useMemo(() => isEligibleForService(shift, myServiceKeys), [shift, myServiceKeys]);

  if (isHiddenRequestShift(shift)) return null;

  const route = getString(shift, "standard_route");
  const trans = getString(shift, "standard_trans_ways");
  const purpose = getString(shift, "standard_purpose");
  const routeParts = [route, trans, purpose].filter((value): value is string => Boolean(value));
  const routeText = routeParts.length ? routeParts.join(" / ") : "—";
  const commuting = coerceBool((shift as unknown as UnknownRecord).commuting_flg) ?? false;
  const biko = getString(shift, "biko");
  const basicInformation = getString(shift, "basic_information");
  const shiftDetailInformation = getString(shift, "shift_detail_information");

  const addr = shift.address || "";
  const postal = shift.postal_code || "";
  const mapsUrl = addr ? `https://www.google.com/maps?q=${encodeURIComponent(addr)}` : null;
  const estimatedPayAmount =
    typeof (shift as unknown as { estimated_pay_amount?: unknown }).estimated_pay_amount === "number"
      ? (shift as unknown as { estimated_pay_amount: number }).estimated_pay_amount
      : null;

  const showBadge =
    coerceBool((shift as unknown as UnknownRecord).time_adjustable) ??
    coerceBool((shift as unknown as UnknownRecord).timeAdjustable) ??
    coerceBool((shift as unknown as UnknownRecord).time_adjust) ??
    coerceBool((shift as unknown as UnknownRecord).timeAdjust) ??
    coerceBool((shift as unknown as UnknownRecord).can_time_adjust) ??
    false;

  const badgeText = getString(shift, "time_adjust_text") ?? DEFAULT_BADGE_TEXT;

  const csId = String(shift.kaipoke_cs_id ?? "");
  const smsPhone = getString(shift, "sms_phone_number");
  const smsReplyPhones = getStringArray(shift, "sms_reply_phone_numbers");
  const smsDefaultMessage = [
    SMS_DEFAULT_HEADER,
    smsReplyPhones.length ? `返信先（担当マネジャー）: ${smsReplyPhones.join(" / ")}` : "",
  ].filter(Boolean).join("\n\n");
  const yearMonth = shift.shift_start_date?.length >= 7 ? shift.shift_start_date.slice(0, 7) : "";
  const monthlyHref =
    csId && yearMonth
      ? `/portal/shift-view?client=${encodeURIComponent(csId)}&date=${encodeURIComponent(yearMonth)}-01`
      : "#";

  const sendSms = async () => {
    if (!smsPhone || !smsBody.trim()) return;
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
          items: [{
            phone: smsPhone,
            body: `${smsDefaultMessage}\n\n${smsBody.trim()}`,
            shift_id: String(shift.shift_id),
            kaipoke_cs_id: shift.kaipoke_cs_id,
          }],
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

  return (
    <Card
      className={[
        "group h-full overflow-hidden border-slate-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cm-primary-300 hover:shadow-cm-card-hover focus-within:ring-2 focus-within:ring-cm-primary-200",
        !eligible ? "bg-slate-50" : "",
        eligible && showBadge ? "border-pink-300 bg-pink-50/70 ring-1 ring-pink-200" : "",
      ].join(" ")}
      style={!eligible ? { opacity: 0.7, filter: "grayscale(0.1)" } : undefined}
    >
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-cm-primary-100 bg-cm-primary-50 px-2.5 py-1.5 text-base font-bold tracking-tight text-cm-primary-900">
              <CalendarDays className="h-4 w-4 shrink-0 text-cm-primary-600" aria-hidden="true" />
              <span className="truncate">{formatShiftDate(shift.shift_start_date)}</span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              <Clock3 className="h-5 w-5 shrink-0 text-cm-primary-600" aria-hidden="true" />
              <span className="tabular-nums">
                {formatShiftTime(shift.shift_start_time)}
                <span className="mx-1 text-slate-400">-</span>
                {formatShiftTime(shift.shift_end_time)}
              </span>
            </div>
          </div>

          {showBadge && (
            <span className="shrink-0 rounded-full border border-pink-300 bg-pink-100 px-2 py-1 text-[11px] font-semibold text-pink-900" title={badgeText}>
              {badgeText}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-600">種別</span>
          <span className="min-w-0 break-words font-semibold text-slate-800">{shift.service_code}</span>
        </div>

        <EstimatedPayLine amount={estimatedPayAmount} />

        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-start gap-2 text-sm text-slate-700">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1 break-words">
              <span className="mr-1 text-xs font-semibold text-slate-500">利用者</span>
              <span className="font-semibold text-slate-900">{shift.client_name ?? "—"}</span> 様
            {commuting && (
              <Dialog>
                <DialogTrigger asChild>
                  <button className="ml-2 text-xs font-semibold text-blue-700 underline underline-offset-2">通所・通学</button>
                </DialogTrigger>
                <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[480px] ml-4 mr-0 modal-avoid-sidebar">
                  <DialogTitle>通所・通学</DialogTitle>
                  <DialogDescription asChild>
                    <div className="text-sm space-y-2">
                      <div>
                        <strong>通所経路等</strong>
                        <p>{routeText}</p>
                      </div>
                    </div>
                  </DialogDescription>
                </DialogContent>
              </Dialog>
            )}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-slate-300" aria-hidden="true" />
            <div
              className={
                shift.gender_request_name === "男性希望"
                  ? "text-blue-700"
                  : shift.gender_request_name === "女性希望"
                    ? "text-rose-700"
                    : "text-slate-700"
              }
            >
              <span className="mr-1 text-xs font-semibold text-slate-500">性別希望</span>
              {shift.gender_request_name ?? "—"}
            {(biko || basicInformation || shiftDetailInformation) && (
              <Dialog>
                <DialogTrigger asChild>
                  <button className="ml-2 text-xs font-semibold text-blue-700 underline underline-offset-2">詳細情報</button>
                </DialogTrigger>
                <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[640px] ml-4 mr-0 modal-avoid-sidebar max-h-[85vh] overflow-hidden">
                  <DialogTitle>詳細情報</DialogTitle>
                  <DialogDescription asChild>
                    <div className="max-h-[70vh] overflow-y-auto pr-2 text-sm space-y-4">
                      {biko && (
                        <div>
                          <strong className="block text-base">備考</strong>
                          <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{biko}</p>
                        </div>
                      )}

                      {basicInformation && (
                        <div className={biko ? "border-t pt-4" : ""}>
                          <strong className="block text-base">基本情報</strong>
                          <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{basicInformation}</p>
                        </div>
                      )}

                      {shiftDetailInformation && (
                        <div className={biko || basicInformation ? "border-t pt-4" : ""}>
                          <strong className="block text-base">詳細情報</strong>
                          <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{shiftDetailInformation}</p>
                        </div>
                      )}
                    </div>
                  </DialogDescription>
                </DialogContent>
              </Dialog>
            )}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1 break-words">
              <span className="mr-1 text-xs font-semibold text-slate-500">住所</span>
              {addr && mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline underline-offset-2" title="Googleマップで開く">
                  {addr}
                </a>
              ) : (
                "—"
              )}
              {postal && <span className="ml-2">（{postal}）</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500">担当スタッフ</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{formatName(staffMap[shift.staff_01_user_id ?? ""])}</span>
            <span>{formatName(staffMap[shift.staff_02_user_id ?? ""])}</span>
            <span>{formatName(staffMap[shift.staff_03_user_id ?? ""])}</span>
          </div>

          {shift.spot_offer_status === "確定" && (
            <span className="mt-2 inline-flex flex-col rounded-lg bg-yellow-100 px-2 py-1 text-xs text-black">
              <span className="font-medium">スポット確定</span>
              <span>
                {shift.applicant_name ?? "—"}（{shift.applicant_sex ?? "—"}）
              </span>

              {(userRole === "admin" || userRole === "manager") && shift.applicant_control_url && (
                <a href={shift.applicant_control_url} target="_blank" rel="noopener noreferrer" className="underline">
                  管理画面
                </a>
              )}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">このシフトを希望する</Button>
            </DialogTrigger>
            <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[480px] sm:mx-auto ml-4 mr-0">
              {!eligible && (
                <div className="mt-3 text-sm text-red-600 font-semibold">
                  保有する資格ではこのサービスに入れない可能性があります。マネジャーに確認もしくは、保有資格の確認をポータルHomeで行ってください。
                </div>
              )}
              <DialogTitle>このシフトを希望しますか？</DialogTitle>
              <DialogDescription asChild>
                <div>
                  希望を送信すると、シフトコーディネート申請が開始されます。
                  <div className="mt-2 text-sm text-gray-500">
                    利用者: {shift.client_name} / 日付: {shift.shift_start_date} / サービス: {shift.service_code}
                  </div>
                  <label className="flex items-center mt-4 gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={attendRequest}
                      onChange={(event) => setAttendRequest(event.target.checked)}
                    />
                    同行を希望する
                  </label>
                  <div className="mt-4">
                    <label className="text-sm font-medium">希望の時間調整（任意）</label>
                    <textarea
                      value={timeAdjustNote}
                      onChange={(event) => setTimeAdjustNote(event.target.value)}
                      placeholder="例）開始を15分後ろに出来れば可 など"
                      className="w-full mt-1 p-2 border rounded"
                    />
                  </div>
                </div>
              </DialogDescription>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  キャンセル
                </Button>
                <Button
                  onClick={() => {
                    const warn = !eligible
                      ? "※保有する資格ではこのサービスに入れない可能性があります。マネジャーに確認もしくは、保有資格の確認をポータルHomeで行ってください。\n"
                      : "";
                    const composed = (warn + (timeAdjustNote || "")).trim();
                    onRequest?.(attendRequest, composed || undefined);
                    setOpen(false);
                  }}
                  disabled={!!creatingRequest}
                >
                  {creatingRequest ? "送信中..." : "希望を送信"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {csId && shift.shift_start_date && (
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href={monthlyHref}>月間</Link>
            </Button>
          )}

          {showSms && <>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!smsPhone}
            onClick={() => {
              setSmsError(null);
              setSmsSent(false);
              setSmsOpen(true);
            }}
          >
            <MessageSquareText className="h-4 w-4" /> 利用者様へSMS
          </Button>

          <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
            <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[560px] sm:mx-auto ml-4 mr-0">
              <DialogTitle>利用者様へSMS送信</DialogTitle>
              <DialogDescription>登録されている利用者様の電話番号へSMSを送信します。</DialogDescription>
              <div className="space-y-3 text-sm">
                <div><strong>送信先</strong><div>{smsPhone || "電話番号未登録"}</div></div>
                <div>
                  <strong>固定文</strong>
                  <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3">{smsDefaultMessage}</div>
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
                    {smsDefaultMessage}{smsBody.trim() ? `\n\n${smsBody.trim()}` : ""}
                  </div>
                </div>
                {smsError && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-red-700">{smsError}</div>}
                {smsSent && <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-green-700">SMSを送信しました。</div>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSmsOpen(false)}>閉じる</Button>
                <Button disabled={smsSending || !smsPhone || !smsBody.trim()} onClick={() => void sendSms()}>
                  {smsSending ? "送信中..." : "SMSを送信"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>}

          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
