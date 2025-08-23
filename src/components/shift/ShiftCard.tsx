// components/shift/ShiftCard.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ShiftData } from "@/types/shift";
import { supabase } from "@/lib/supabaseClient";

type Mode = "request" | "reject";

type Props = {
  shift: ShiftData;
  mode: Mode;
  onRequest?: (attendRequest: boolean, timeAdjustNote?: string) => void;
  creatingRequest?: boolean;
  onReject?: (reason: string) => void;
  extraActions?: React.ReactNode;
  /** 親で強制ON/OFF */
  timeAdjustable?: boolean;
  /** 親で表示文言 */
  timeAdjustText?: string;
  /** 親からマスター（id→行）を渡すとDBアクセス不要に */
  timeAdjustMaster?: Record<
    string,
    { label: string; is_adjustable?: boolean; badge_text?: string }
  >;
  /** Supabaseテーブル名（未指定なら m_time_adjustability） */
  timeAdjustabilityTableName?: string;
};

type UnknownRecord = Record<string, unknown>;

/* ===================== 共通ヘルパ ===================== */
const DEFAULT_BADGE_TEXT = "時間変更調整";

function coerceBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v !== 0 : undefined;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y", "on", "可", "ok"].includes(s)) return true;
    if (["0", "false", "f", "no", "n", "off", "", "不可", "ng"].includes(s)) return false;
    const n = Number(s);
    if (!Number.isNaN(n)) return n !== 0;
  }
  return undefined;
}

function pickBooleanish(obj: unknown, keys: readonly string[]): boolean | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  for (const k of keys) {
    const b = coerceBoolean(rec[k]);
    if (b !== undefined) return b;
  }
  return undefined;
}

function pickNonEmptyString(obj: unknown, keys: readonly string[]): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t !== "") return t;
    }
  }
  return undefined;
}

function readString(obj: unknown, key: string): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  const v = rec[key];
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "") return t;
  }
  return undefined;
}
function readBool(obj: unknown, key: string): boolean | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  return coerceBoolean(rec[key]);
}
/*
function pickIdString(obj: unknown, keys: readonly string[]): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  for (const k of keys) {
    const v = rec[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t !== "") return t;
    }
    if (typeof v === "number") return String(v);
  }
  return undefined;
}
*/

function guessAdjustableFromText(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes("不可") || t.includes("ng")) return false;
  if (
    t.includes("可") ||
    t.includes("調整") ||
    t.includes("±") ||
    t.includes("前後") ||
    t.includes("ok") ||
    t.includes("要相談")
  )
    return true;
  return true; // 不明は可で仮表示（必要なら false に変更）
}

/** ネスト or 直値 どちらでも time_adjustability を抽出 */
function extractTimeAdjustFromShift(shift: unknown): {
  id?: string;
  badge?: string;
  adjustable?: boolean;
} {
  if (typeof shift !== "object" || shift === null) return {};
  const rec = shift as UnknownRecord;

  // 1) ネスト: time_adjustability / timeAdjustability が { id, label, badge_text, is_adjustable }
  let nested = rec["time_adjustability"];
  if (!nested) nested = rec["timeAdjustability"];
  if (nested && typeof nested === "object") {
    const o = nested as UnknownRecord;
    const id =
      typeof o.id === "string" && o.id.trim() !== ""
        ? o.id.trim()
        : typeof o.id === "number"
        ? String(o.id)
        : undefined;
    const badge =
      (typeof o.badge_text === "string" && o.badge_text.trim() !== "" && o.badge_text.trim()) ||
      (typeof o.label === "string" && o.label.trim() !== "" && o.label.trim()) ||
      (typeof o.name === "string" && o.name.trim() !== "" && o.name.trim());
    const adjustable =
      typeof o.is_adjustable === "boolean"
        ? o.is_adjustable
        : badge
        ? guessAdjustableFromText(badge)
        : undefined;
    return { id, badge, adjustable };
  }

  // 2) 直値: *_id 系
  const rawId =
    rec["time_adjustability_id"] ??
    rec["timeAdjustabilityId"] ??
    rec["time_adjustability"] ??
    rec["timeAdjustability"];
  const id =
    typeof rawId === "string"
      ? rawId
      : typeof rawId === "number"
      ? String(rawId)
      : undefined;

  return { id };
}

/* ===================== キャッシュ ===================== */
const timeAdjCache = new Map<
  string,
  { label: string; isAdjustable: boolean; badgeText?: string }
>();

/* ===================== Component ===================== */
export default function ShiftCard({
  shift,
  mode,
  onRequest,
  creatingRequest,
  onReject,
  extraActions,
  timeAdjustable,
  timeAdjustText,
  timeAdjustMaster,
  timeAdjustabilityTableName = "m_time_adjustability",
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  // MiniInfo（利用者名・通学・備考）
  const MiniInfo = () => (
    <>
      <div className="text-sm">
        利用者名: {shift.client_name ?? "—"} 様
        {(pickBooleanish(shift, ["commuting_flg", "commutingFlg"]) ?? false) && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm space-y-2">
                <div>
                  <strong>通所経路等</strong>
                  <p>
                    {[shift.standard_route, shift.standard_trans_ways, shift.standard_purpose]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </p>
                </div>
              </div>
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
        {pickNonEmptyString(shift, ["biko"]) && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">詳細情報</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm">
                <strong>備考</strong>
                <p>{pickNonEmptyString(shift, ["biko"])}</p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );

  /* ====== time_adjustability（ネスト/直値どちらでも） ====== */
  const nested = useMemo(() => extractTimeAdjustFromShift(shift), [shift]);

  // マスターからの値（初期はネストの値をそのまま採用）
  const [masterBadgeText, setMasterBadgeText] = useState<string | undefined>(
    nested.badge
  );
  const [masterAdjustable, setMasterAdjustable] = useState<boolean | undefined>(
    nested.adjustable
  );

  // 1) 親からのマップ優先
  useEffect(() => {
    if (!nested.id || !timeAdjustMaster) return;
    const row = timeAdjustMaster[String(nested.id)];
    if (!row) return;
    const badge = row.badge_text || row.label;
    setMasterBadgeText(badge);
    setMasterAdjustable(
      typeof row.is_adjustable === "boolean"
        ? row.is_adjustable
        : guessAdjustableFromText(badge || "")
    );
  }, [nested.id, timeAdjustMaster]);

  // 2) 親マップが無い場合、Supabaseで単発取得（キャッシュあり）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!nested.id) return;
      if (timeAdjustMaster) return; // すでに親から供給済み
      if (timeAdjCache.has(nested.id)) {
        const c = timeAdjCache.get(nested.id)!;
        if (!cancelled) {
          setMasterBadgeText(c.badgeText ?? c.label);
          setMasterAdjustable(c.isAdjustable);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from(timeAdjustabilityTableName)
          .select("id,label,badge_text,is_adjustable")
          .eq("id", nested.id)
          .maybeSingle();
        if (error || !data) return;
        const rec = data as UnknownRecord;
        const label =
          typeof rec.label === "string" ? rec.label : String(nested.id);
        const badge =
          typeof rec.badge_text === "string" && rec.badge_text.trim() !== ""
            ? rec.badge_text
            : label;
        const isAdj =
          typeof rec.is_adjustable === "boolean"
            ? rec.is_adjustable
            : guessAdjustableFromText(badge);
        timeAdjCache.set(nested.id, { label, isAdjustable: isAdj, badgeText: badge });
        if (!cancelled) {
          setMasterBadgeText(badge);
          setMasterAdjustable(isAdj);
        }
      } catch {
        /* no-op */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nested.id, timeAdjustMaster, timeAdjustabilityTableName]);

  // 3) 旧フィールドのフォールバック
  const fallbackBool = useMemo(
    () =>
      (readBool(shift, "time_adjustable") ??
        readBool(shift, "timeAdjustable") ??
        readBool(shift, "time_adjust") ??
        readBool(shift, "timeAdjust") ??
        readBool(shift, "can_time_adjust")) ??
      Boolean(readString(shift, "timeAdjustNote") ?? readString(shift, "time_adjust_note")),
    [shift]
  );

  // 4) 最終判定（親 > マスター > フォールバック > ネスト/IDがあれば暫定表示）
  const showBadge: boolean =
    typeof timeAdjustable === "boolean"
      ? timeAdjustable
      : (masterAdjustable ?? fallbackBool ?? (nested.id || nested.badge ? true : false));

  // バッジ文言（親 > マスター > ネスト > 旧フィールド > 既定）
  const badgeText: string =
    timeAdjustText ??
    masterBadgeText ??
    nested.badge ??
    (readString(shift, "timeAdjustNote") ?? readString(shift, "time_adjust_note")) ??
    DEFAULT_BADGE_TEXT;

  /* ===================== Render ===================== */
  return (
    <Card className={`shadow ${showBadge ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : ""}`}>
      <CardContent className="p-4">
        {/* ヘッダ行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">
            {shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}～{shift.shift_end_time?.slice(0, 5)}
          </div>
          {showBadge && (
            <span
              className="text-[11px] px-2 py-0.5 rounded bg-pink-100 border border-pink-300"
              title={badgeText}
            >
              {badgeText}
            </span>
          )}
        </div>

        {/* 基本情報 */}
        <div className="text-sm mt-1">種別: {shift.service_code}</div>
        <div className="text-sm">郵便番号: {shift.address}</div>
        <div className="text-sm">エリア: {shift.district}</div>

        {/* 利用者名/備考など */}
        <div className="mt-2 space-y-1">
          <MiniInfo />
        </div>

        {/* アクション */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {mode === "request" ? (
                <Button onClick={() => setOpen(true)}>このシフトを希望する</Button>
              ) : (
                <Button className="bg-red-500 text-white" onClick={() => setOpen(true)}>
                  このシフトに入れない
                </Button>
              )}
            </DialogTrigger>

            <DialogContent className="max-w-[480px]">
              {mode === "request" ? (
                <>
                  <DialogTitle>このシフトを希望しますか？</DialogTitle>
                  <DialogDescription>
                    希望を送信すると、シフトコーディネート申請が開始されます。
                    <div className="mt-2 text-sm text-gray-500">
                      利用者: {shift.client_name} / 日付: {shift.shift_start_date} / サービス: {shift.service_code}
                    </div>
                    <label className="flex items-center mt-4 gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={attendRequest}
                        onChange={(e) => setAttendRequest(e.target.checked)}
                      />
                      同行を希望する
                    </label>
                    <div className="mt-4">
                      <label className="text-sm font-medium">希望の時間調整（任意）</label>
                      <textarea
                        value={timeAdjustNote}
                        onChange={(e) => setTimeAdjustNote(e.target.value)}
                        placeholder="例）開始を15分後ろに出来れば可 など"
                        className="w-full mt-1 p-2 border rounded"
                      />
                    </div>
                  </DialogDescription>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => {
                        onRequest?.(attendRequest, timeAdjustNote || undefined);
                        setOpen(false);
                      }}
                      disabled={!!creatingRequest}
                    >
                      {creatingRequest ? "送信中..." : "希望を送信"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <DialogTitle>シフトに入れない</DialogTitle>
                  <DialogDescription>
                    {shift.client_name} 様のシフトを外します。理由を入力してください。
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="シフトに入れない理由"
                      className="w-full mt-2 p-2 border"
                    />
                  </DialogDescription>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      キャンセル
                    </Button>
                    <Button
                      disabled={!reason}
                      onClick={() => {
                        onReject?.(reason);
                        setOpen(false);
                      }}
                    >
                      処理実行を確定
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
