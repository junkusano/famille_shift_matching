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
  /** 親からマスター（id→行）を渡すとDBアクセス不要に
   *  例: { "uuid": { label: "±1.0Hまで可", Advance_adjustability: 1, Backwoard_adjustability: 1 } }
   */
  timeAdjustMaster?: Record<
    string,
    { label: string; Advance_adjustability?: number | string; Backwoard_adjustability?: number | string }
  >;
  /** Supabaseテーブル名（未指定なら cs_kaipoke_time_adjustability） */
  timeAdjustabilityTableName?: string;
};

type UnknownRecord = Record<string, unknown>;

/* ===================== ヘルパ ===================== */
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
function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** どの階層にあっても time_adjustability_id / マスター行を抽出（配列も再帰探索、循環防止あり） */
function deepExtractTimeAdjust(obj: unknown, maxDepth = 5): {
  id?: string;         // time_adjustability_id
  label?: string;      // マスターのラベル
  adv?: number;        // Advance_adjustability
  back?: number;       // Backwoard_adjustability
} {
  const seen = new Set<unknown>();

  function helper(node: unknown, depth: number): { id?: string; label?: string; adv?: number; back?: number } {
    if (node === null || typeof node !== "object" || depth > maxDepth || seen.has(node)) return {};
    seen.add(node);
    const rec = node as UnknownRecord;

    // 1) 直に *_id がある
    const rawId =
      rec["time_adjustability_id"] ??
      rec["timeAdjustabilityId"] ??
      rec["time_adjustability"] ??
      rec["timeAdjustability"];
    if (typeof rawId === "string" && rawId.trim() !== "") return { id: rawId.trim() };
    if (typeof rawId === "number") return { id: String(rawId) };

    // 2) マスター行っぽい塊（label + Advance/Backwoard）
    const hasLabel = typeof rec["label"] === "string" && (rec["label"] as string).trim() !== "";
    const adv = toNum(rec["Advance_adjustability"]);
    const back = toNum(rec["Backwoard_adjustability"]);
    const masterId =
      (typeof rec["id"] === "string" && (rec["id"] as string).trim() !== "" && (rec["id"] as string).trim()) ||
      (typeof rec["id"] === "number" && String(rec["id"]));
    if (hasLabel && (adv !== undefined || back !== undefined)) {
      return {
        id: masterId,
        label: (rec["label"] as string).trim(),
        adv: adv ?? 0,
        back: back ?? 0,
      };
    }

    // 3) 子要素を再帰探索（オブジェクト & 配列）
    for (const key in rec) {
      const val = rec[key];
      const got = helper(val, depth + 1);
      if (got.id || got.label) return got;
    }
    if (Array.isArray(node)) {
      for (const item of node as unknown[]) {
        const got = helper(item, depth + 1);
        if (got.id || got.label) return got;
      }
    }
    return {};
  }

  return helper(obj, 0);
}

/* ===================== キャッシュ ===================== */
const timeAdjCache = new Map<string, { label: string; adv?: number; back?: number }>();

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
  timeAdjustabilityTableName = "cs_kaipoke_time_adjustability",
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  // 利用者名/備考など
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

  /* ====== time_adjustability（深掘り抽出 → ラベル/可否を解決） ====== */
  const deep = useMemo(() => deepExtractTimeAdjust(shift), [shift]);

  const [resolvedLabel, setResolvedLabel] = useState<string | undefined>(deep.label);
  const [resolvedAdjustable, setResolvedAdjustable] = useState<boolean | undefined>(
    typeof deep.adv === "number" || typeof deep.back === "number"
      ? ((deep.adv ?? 0) !== 0 || (deep.back ?? 0) !== 0)
      : undefined
  );

  // 1) 親マップを優先
  useEffect(() => {
    if (!deep.id || !timeAdjustMaster) return;
    const row = timeAdjustMaster[String(deep.id)];
    if (!row) return;
    const adv = toNum(row.Advance_adjustability) ?? 0;
    const back = toNum(row.Backwoard_adjustability) ?? 0;
    setResolvedLabel(row.label);
    setResolvedAdjustable(adv !== 0 || back !== 0);
  }, [deep.id, timeAdjustMaster]);

  // 2) 親マップが無ければ Supabase 単発（キャッシュあり）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deep.id) return;
      if (timeAdjustMaster) return; // 親から供給済
      if (resolvedLabel !== undefined && resolvedAdjustable !== undefined) return; // 深掘りで取得済
      if (timeAdjCache.has(deep.id)) {
        const c = timeAdjCache.get(deep.id)!;
        if (!cancelled) {
          setResolvedLabel(c.label);
          setResolvedAdjustable(((c.adv ?? 0) !== 0) || ((c.back ?? 0) !== 0));
        }
        return;
      }
      const { data, error } = await supabase
        .from(timeAdjustabilityTableName)
        .select("id,label,Advance_adjustability,Backwoard_adjustability")
        .eq("id", deep.id)
        .maybeSingle();
      if (error || !data) return;
      const rec = data as UnknownRecord;
      const label = typeof rec["label"] === "string" ? (rec["label"] as string) : String(deep.id);
      const adv = toNum(rec["Advance_adjustability"]) ?? 0;
      const back = toNum(rec["Backwoard_adjustability"]) ?? 0;
      timeAdjCache.set(deep.id, { label, adv, back });
      if (!cancelled) {
        setResolvedLabel(label);
        setResolvedAdjustable(adv !== 0 || back !== 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deep.id, resolvedLabel, resolvedAdjustable, timeAdjustMaster, timeAdjustabilityTableName]);

  // 3) 旧フィールドのフォールバック（※無くてもOK）
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

  // 4) 最終判定（親 > マスター/深掘り > フォールバック > IDが見つかれば暫定表示）
  const showBadge: boolean =
    typeof timeAdjustable === "boolean"
      ? timeAdjustable
      : (resolvedAdjustable ?? fallbackBool ?? (deep.id ? true : false));

  // バッジ文言（親 > マスター/深掘り > 旧フィールド文言 > 既定）
  const badgeText: string =
    timeAdjustText ??
    resolvedLabel ??
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
            <span className="text-[11px] px-2 py-0.5 rounded bg-pink-100 border border-pink-300" title={badgeText}>
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
