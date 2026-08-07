"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
};

type UnknownRecord = Record<string, unknown>;

const DEFAULT_BADGE_TEXT = "時間調整可能";

function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as UnknownRecord)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
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
    <div className="text-sm mt-1 font-semibold text-emerald-700">
      概算給与: {amount.toLocaleString()}円
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

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
  const yearMonth = shift.shift_start_date?.length >= 7 ? shift.shift_start_date.slice(0, 7) : "";
  const monthlyHref =
    csId && yearMonth
      ? `/portal/shift-view?client=${encodeURIComponent(csId)}&date=${encodeURIComponent(yearMonth)}-01`
      : "#";

  return (
    <Card
      className={[
        "shadow",
        !eligible ? "bg-gray-100" : "",
        eligible && showBadge ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : "",
      ].join(" ")}
      style={!eligible ? { opacity: 0.7, filter: "grayscale(0.1)" } : undefined}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">
            {shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}～{shift.shift_end_time?.slice(0, 5)}
          </div>
          {showBadge && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-pink-100 border border-pink-300" title={badgeText}>
              {badgeText}
            </span>
          )}
        </div>

        <div className="text-sm mt-1">種別: {shift.service_code}</div>
        <EstimatedPayLine amount={estimatedPayAmount} />

        <div className="text-sm">
          住所:{" "}
          {addr && mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600" title="Googleマップで開く">
              {addr}
            </a>
          ) : (
            "—"
          )}
          {postal && <span className="ml-2">（{postal}）</span>}
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-sm">
            利用者名: {shift.client_name ?? "—"} 様
            {commuting && (
              <Dialog>
                <DialogTrigger asChild>
                  <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
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

          <div
            className="text-sm"
            style={{
              color:
                shift.gender_request_name === "男性希望"
                  ? "blue"
                  : shift.gender_request_name === "女性希望"
                    ? "red"
                    : "black",
            }}
          >
            性別希望: {shift.gender_request_name ?? "—"}
            {(biko || basicInformation || shiftDetailInformation) && (
              <Dialog>
                <DialogTrigger asChild>
                  <button className="ml-2 text-xs text-blue-500 underline">詳細情報</button>
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

        <div className="text-sm mt-2">
          スタッフ：
          <span className="inline-block mr-3">{formatName(staffMap[shift.staff_01_user_id ?? ""])}</span>
          <span className="inline-block mr-3">{formatName(staffMap[shift.staff_02_user_id ?? ""])}</span>
          <span className="inline-block">{formatName(staffMap[shift.staff_03_user_id ?? ""])}</span>

          {shift.spot_offer_status === "確定" && (
            <span className="ml-3 inline-flex flex-col rounded bg-yellow-100 px-2 py-1 text-xs text-black align-middle">
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

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>このシフトを希望する</Button>
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
            <Button variant="secondary" asChild>
              <Link href={monthlyHref}>月間</Link>
            </Button>
          )}

          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
