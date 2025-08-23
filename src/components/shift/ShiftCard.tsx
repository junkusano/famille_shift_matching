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
import { supabase } from "@/lib/supabaseClient"; // マスター直取得用（任意）

// ===== 型 =====
type Mode = "request" | "reject";

type Props = {
  shift: ShiftData;
  mode: Mode;
  onRequest?: (attendRequest: boolean, timeAdjustNote?: string) => void;
  creatingRequest?: boolean;
  onReject?: (reason: string) => void;
  extraActions?: React.ReactNode;
  /** true なら強制的にバッジON（親優先） */
  timeAdjustable?: boolean;
  /** バッジ表示文言（親優先） */
  timeAdjustText?: string;
  /**
   * 可能なら親からマスターマップを渡す（推奨）。
   * key: time_adjustability_id（文字列化）, value: { label, is_adjustable?, badge_text? }
   */
  timeAdjustMaster?: Record<string, { label: string; is_adjustable?: boolean; badge_text?: string }>;
  /** Supabaseテーブル名（未指定なら "m_time_adjustability" を参照） */
  timeAdjustabilityTableName?: string;
};

// ===== ヘルパ（any禁止） =====
type UnknownRecord = Record<string, unknown>;

function coerceBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v !== 0 : undefined;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "f", "no", "n", "off", ""].includes(s)) return false;
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

function guessAdjustableFromText(text: string): boolean {
  const t = text.toLowerCase();
  // NGワード優先
  if (t.includes("不可") || t.includes("ng")) return false;
  // OKを示す語群
  if (
    t.includes("可") ||
    t.includes("調整") ||
    t.includes("±") ||
    t.includes("前後") ||
    t.includes("ok") ||
    t.includes("要相談")
  ) {
    return true;
  }
  return true; // 不明なら可で表示（必要なら false に変更）
}

// マスター行のキャッシュ（クライアント内）
const timeAdjCache = new Map<string, { label: string; isAdjustable: boolean; badgeText?: string }>();

/** 1件のシフト表示＋モーダル操作を共通化 */
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
  // ===== ローカル状態 =====
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  // マスター参照結果
  const [masterLabel, setMasterLabel] = useState<string | undefined>(undefined);
  const [masterBadgeText, setMasterBadgeText] = useState<string | undefined>(undefined);
  const [masterAdjustable, setMasterAdjustable] = useState<boolean | undefined>(undefined);

  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  // shift から ID を抽出
  const timeAdjId = useMemo(
    () =>
      pickIdString(shift, [
        "time_adjustability_id",
        "timeAdjustabilityId",
        "time_adjustability",
        "timeAdjustability",
      ]),
    [shift]
  );

  // 親がマップをくれた場合はそれを優先
  useEffect(() => {
    if (!timeAdjId || !timeAdjustMaster) return;
    const row = timeAdjustMaster[String(timeAdjId)];
    if (!row) return;
    const badge = row.badge_text || row.label;
    setMasterBadgeText(badge);
    setMasterLabel(row.label);
    setMasterAdjustable(
      typeof row.is_adjustable === "boolean" ? row.is_adjustable : guessAdjustableFromText(badge)
    );
  }, [timeAdjId, timeAdjustMaster]);

  // マップが無い場合は Supabase を単発参照（キャッシュ付き）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!timeAdjId) return;
      if (timeAdjustMaster) return; // すでに親から来ている
      if (timeAdjCache.has(timeAdjId)) {
        const c = timeAdjCache.get(timeAdjId)!;
        if (!cancelled) {
          setMasterBadgeText(c.badgeText ?? c.label);
          setMasterLabel(c.label);
          setMasterAdjustable(c.isAdjustable);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from(timeAdjustabilityTableName)
          .select("id,label,badge_text,is_adjustable")
          .eq("id", timeAdjId)
          .maybeSingle();
        if (error) {
          // 失敗しても致命ではない（ログのみ）
          console.warn("time_adjustability fetch error", error);
          return;
        }
        if (!data) return;
        const rec = data as UnknownRecord;
        const label = typeof rec.label === "string" ? rec.label : String(timeAdjId);
        const badge = typeof rec.badge_text === "string" && rec.badge_text.trim() !== "" ? rec.badge_text : label;
        const isAdj = typeof rec.is_adjustable === "boolean" ? rec.is_adjustable : guessAdjustableFromText(badge);
        const cached = { label, isAdjustable: isAdj, badgeText: badge };
        timeAdjCache.set(timeAdjId, cached);
        if (!cancelled) {
          setMasterBadgeText(badge);
          setMasterLabel(label);
          setMasterAdjustable(isAdj);
        }
      } catch (e) {
        console.warn("time_adjustability fetch exception", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeAdjId, timeAdjustMaster, timeAdjustabilityTableName]);

  // 既存の多様なブール・テキストからも拾う（後方互換）
  const fallbackBool = useMemo(
    () =>
      pickBooleanish(shift, [
        "time_adjustable",
        "timeAdjustable",
        "time_adjust",
        "timeAdjust",
        "can_time_adjust",
      ]) ?? Boolean(pickNonEmptyString(shift, ["timeAdjustNote", "time_adjust_note"])),
    [shift]
  );

  // 最終判定（親 > マスター > フォールバック）
  const derivedTimeAdjustable: boolean =
    typeof timeAdjustable === "boolean"
      ? timeAdjustable
      : (masterAdjustable ?? fallbackBool ?? false);

  const derivedTimeAdjustText: string =
    (timeAdjustText ?? masterBadgeText ?? pickNonEmptyString(shift, ["timeAdjustNote", "time_adjust_note"]) ??
      (masterLabel ? `${masterLabel}` : undefined)) ?? "時間調整が可能です";

  // ===== サブ表示（通学/備考） =====
  const MiniInfo = () => (
    <>
      <div className="text-sm">
        利用者名: {shift.client_name} 様
        {shift.commuting_flg && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm">
                <strong>通所経路等</strong>
                <p>
                  {[shift.standard_route, shift.standard_trans_ways, shift.standard_purpose]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
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
        性別希望: {shift.gender_request_name}
        {shift.biko && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">詳細情報</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm">
                <strong>備考</strong>
                <p>{shift.biko}</p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );

  return (
    <Card className={`shadow ${derivedTimeAdjustable ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : ""}`}>
      <CardContent className="p-4">
        {/* ヘッダ行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">
            {shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}～{shift.shift_end_time?.slice(0, 5)}
          </div>

          {derivedTimeAdjustable && (
            <span
              className="text-[11px] px-2 py-0.5 rounded bg-pink-100 border border-pink-300"
              title={derivedTimeAdjustText}
            >
              {derivedTimeAdjustText}
            </span>
          )}
        </div>

        {/* 基本情報 */}
        <div className="text-sm mt-1">種別: {shift.service_code}</div>
        <div className="text-sm">郵便番号: {shift.address}</div>
        <div className="text-sm">エリア: {shift.district}</div>
        <MiniInfo />

        {/* アクション行 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {mode === "request" ? (
                <Button onClick={openDialog}>このシフトを希望する</Button>
              ) : (
                <Button className="bg-red-500 text-white" onClick={openDialog}>
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
                    <Button variant="outline" onClick={closeDialog}>キャンセル</Button>
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
                    <Button variant="outline" onClick={closeDialog}>キャンセル</Button>
                    <Button
                      disabled={!reason}
                      onClick={() => {
                        onReject?.(reason);
                        closeDialog();
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
