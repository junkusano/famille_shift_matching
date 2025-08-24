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

  /** 親で強制ON/OFF（指定があればそれを優先） */
  timeAdjustable?: boolean;
  /** 親で文言を上書き（未指定ならマスターの label） */
  timeAdjustText?: string;

  /** テーブル名の上書き（不要なら触らない） */
  kaipokeInfoTableName?: string;              // 既定: cs_kaipoke_info
  timeAdjustabilityTableName?: string;        // 既定: cs_kaipoke_time_adjustability
};

type UnknownRecord = Record<string, unknown>;

/* ---------- helpers ---------- */
const DEFAULT_BADGE_TEXT = "時間調整可能";
const TBL_INFO = "cs_kaipoke_info";
const TBL_ADJ = "cs_kaipoke_time_adjustability";

function coerceBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y", "on", "可", "ok"].includes(s)) return true;
    if (["0", "false", "f", "no", "n", "off", "", "不可", "ng"].includes(s)) return false;
    const n = Number(s); if (!Number.isNaN(n)) return n !== 0;
  }
  return undefined;
}
// 追加：オブジェクトのどこにあっても kaipoke_cs_id を再帰で探す（配列対応・循環防止）
function deepFindKaipokeCsId(node: unknown, maxDepth = 5): string | undefined {
  const seen = new Set<unknown>();
  const KEYS = [
    "kaipoke_cs_id", "kaipokeCsId",
    "cs_id", "client_cs_id", "clientCsId",
    "kaipokeId", "kaipoke_id",
  ];
  function walk(n: unknown, d: number): string | undefined {
    if (n === null || typeof n !== "object" || d > maxDepth || seen.has(n)) return undefined;
    seen.add(n);
    const rec = n as Record<string, unknown>;

    // 直撃
    for (const k of KEYS) {
      const v = rec[k];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
      if (typeof v === "number") return String(v);
    }

    // 子要素を探索（オブジェクト & 配列）
    for (const k in rec) {
      const got = walk(rec[k], d + 1);
      if (got) return got;
    }
    if (Array.isArray(n)) {
      for (const item of n as unknown[]) {
        const got = walk(item, d + 1);
        if (got) return got;
      }
    }
    return undefined;
  }
  return walk(node, 0);
}
function pickStr(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as UnknownRecord)[key];
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}
function pickNum(obj: unknown, key: string): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as UnknownRecord)[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); if (!Number.isNaN(n)) return n; }
  return undefined;
}

/** shift から kaipoke_cs_id を拾う（トップレベル優先。必要ならネストも見る） */
/*
function extractKaipokeCsId(shift: unknown): string | undefined {
  if (!shift || typeof shift !== "object") return undefined;
  const r = shift as UnknownRecord;
  let raw = r["kaipoke_cs_id"] ?? r["kaipokeCsId"];
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "number") return String(raw);

  const info = r["cs_kaipoke_info"];
  raw = info && (info as UnknownRecord)["kaipoke_cs_id"];
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "number") return String(raw);

  return undefined;
}
  */

/* 簡易キャッシュ（ビルド間で共有しない揮発キャッシュ） */
const infoIdCache = new Map<string, string>(); // cs_id -> time_adjustability_id
const masterCache = new Map<string, { label: string; adv: number; back: number }>();

// 追加：文字列を複数キーから安全に取得
function pickNonEmptyString(obj: unknown, keys: readonly string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t !== "") return t;
    }
  }
  return undefined;
}

// 追加：boolean-ish を複数キーから安全に取得
function pickBooleanish(obj: unknown, keys: readonly string[]): boolean | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const b = coerceBool(rec[k]);
    if (b !== undefined) return b;
  }
  return undefined;
}

/* ---------- Component ---------- */
export default function ShiftCard({
  shift,
  mode,
  onRequest,
  creatingRequest,
  onReject,
  extraActions,
  timeAdjustable,
  timeAdjustText,
  kaipokeInfoTableName = TBL_INFO,
  timeAdjustabilityTableName = TBL_ADJ,
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  // 1) shift から cs_id を取得（この前提だけに限定）
  const csId = useMemo(() => deepFindKaipokeCsId(shift), [shift]);

  // 2) cs_id -> time_adjustability_id
  const [adjId, setAdjId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!csId) { setAdjId(undefined); return; }
      if (infoIdCache.has(csId)) { setAdjId(infoIdCache.get(csId)); return; }
      const { data, error } = await supabase
        .from(kaipokeInfoTableName)
        .select("time_adjustability_id")
        .eq("kaipoke_cs_id", csId)
        .maybeSingle();
      if (error || !data) { setAdjId(undefined); return; }
      const id =
        typeof (data as UnknownRecord)["time_adjustability_id"] === "string"
          ? ((data as UnknownRecord)["time_adjustability_id"] as string).trim()
          : typeof (data as UnknownRecord)["time_adjustability_id"] === "number"
            ? String((data as UnknownRecord)["time_adjustability_id"])
            : undefined;
      if (!cancelled) {
        if (id) infoIdCache.set(csId, id);
        setAdjId(id);
      }
    })();
    return () => { cancelled = true; };
  }, [csId, kaipokeInfoTableName]);

  // 3) time_adjustability_id -> マスター（label, Advance/Backwoard）
  const [label, setLabel] = useState<string | undefined>(undefined);
  const [adjustable, setAdjustable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!adjId) { setLabel(undefined); setAdjustable(undefined); return; }
      if (masterCache.has(adjId)) {
        const m = masterCache.get(adjId)!;
        if (!cancelled) {
          setLabel(m.label);
          setAdjustable((m.adv !== 0) || (m.back !== 0));
        }
        return;
      }
      const { data, error } = await supabase
        .from(timeAdjustabilityTableName)
        .select("label,Advance_adjustability,Backwoard_adjustability")
        .eq("id", adjId)
        .maybeSingle();
      if (error || !data) { return; }
      const rec = data as UnknownRecord;
      const lab = pickStr(rec, "label") ?? DEFAULT_BADGE_TEXT;
      const adv = pickNum(rec, "Advance_adjustability") ?? 0;
      const back = pickNum(rec, "Backwoard_adjustability") ?? 0;
      masterCache.set(adjId, { label: lab, adv, back });
      if (!cancelled) {
        setLabel(lab);
        setAdjustable(adv !== 0 || back !== 0);
      }
    })();
    return () => { cancelled = true; };
  }, [adjId, timeAdjustabilityTableName]);

  // 4) 旧フィールドのフォールバック（互換維持。無ければ undefined のまま）
  const fallbackBool = useMemo(() => {
    const b =
      coerceBool((shift as unknown as UnknownRecord)["time_adjustable"]) ??
      coerceBool((shift as unknown as UnknownRecord)["timeAdjustable"]) ??
      coerceBool((shift as unknown as UnknownRecord)["time_adjust"]) ??
      coerceBool((shift as unknown as UnknownRecord)["timeAdjust"]) ??
      coerceBool((shift as unknown as UnknownRecord)["can_time_adjust"]);
    return b ?? false;
  }, [shift]);

  // 5) 最終判定（親 > マスター判定 > 旧互換）
  const showBadge =
    typeof timeAdjustable === "boolean"
      ? timeAdjustable
      : (adjustable ?? fallbackBool);

  // 文言（親 > マスターlabel > 既定）
  const badgeText = timeAdjustText ?? label ?? DEFAULT_BADGE_TEXT;

  /* ------- MiniInfo（名前/備考や通学情報） ------- */
  const MiniInfo = () => {
    // 文字列は安全ヘルパで取得
    const route = pickNonEmptyString(shift, ["standard_route"]);
    const trans = pickNonEmptyString(shift, ["standard_trans_ways"]);
    const purpose = pickNonEmptyString(shift, ["standard_purpose"]);
    const routeParts = [route, trans, purpose].filter((v): v is string => Boolean(v));
    const routeText = routeParts.length ? routeParts.join(" / ") : "—";

    // 通学フラグもヘルパで
    const commuting = pickBooleanish(shift, ["commuting_flg", "commutingFlg"]) ?? false;

    // 備考
    const biko = pickNonEmptyString(shift, ["biko"]);

    return (
      <>
        <div className="text-sm">
          利用者名: {shift.client_name ?? "—"} 様
          {commuting && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
              </DialogTrigger>
              <DialogContent className="max-w-[480px]">
                <div className="text-sm space-y-2">
                  <div>
                    <strong>通所経路等</strong>
                    <p>{routeText}</p>
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
          {biko && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="ml-2 text-xs text-blue-500 underline">詳細情報</button>
              </DialogTrigger>
              <DialogContent className="max-w-[480px]">
                <div className="text-sm">
                  <strong>備考</strong>
                  <p>{biko}</p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </>
    );
  };

  // components/shift/ShiftCard.tsx （return直前の判定だけ差し替え）
  /*
  if (mode === "request") {
    const lso: number | null | undefined = shift.level_sort_order;
    // nullは許可、数値は3,500,000以下のみ許可。undefinedは不許可。
    const canShow = lso === null || (typeof lso === "number" && lso <= 3500000);
    if (!canShow) return null;
  }
    */

  /* ------- Render ------- */
  return (
    <Card className={`shadow ${showBadge ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : ""}`}>
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
        <div className="text-sm">郵便番号: {shift.address}</div>
        <div className="text-sm">エリア: {shift.district}</div>

        <div className="mt-2 space-y-1">
          <MiniInfo />
        </div>

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
