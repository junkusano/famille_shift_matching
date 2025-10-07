// components/shift/ShiftCard.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogTrigger, DialogContent, DialogPortal, DialogTitle, DialogDescription, DialogOverlay
} from "@/components/ui/dialog";
import type { ShiftData } from "@/types/shift";
import { supabase } from "@/lib/supabaseClient";
import {
  determineServicesFromCertificates,
  type DocMasterRow as CertMasterRow,
  type ServiceKey,
} from "@/lib/certificateJudge";
import type { DocItem, Attachment } from "@/components/DocUploader";
import ShiftRecordLinkButton from "@/components/shift/ShiftRecordLinkButton";
import Link from "next/link";

// ShiftCard.tsx のファイル先頭（importの下）
let __keysCache: ServiceKey[] | null | undefined = undefined; // undefined=未取得, null=失敗, []=資格なし
let __keysPromise: Promise<ServiceKey[]> | null = null;
let __myUserId: string | null | undefined = undefined; // undefined=未取得
let __myUserIdPromise: Promise<string | null> | null = null;
type Mode = "request" | "reject" | "view";

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

const REJECT_BTN_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 px-4 py-2 " +
  "bg-purple-600 hover:bg-purple-700 text-white border border-purple-600";


// ShiftData から shift_id（なければ id）を必ず string にして返す
const getShiftIdStr = (s: ShiftData): string => {
  const sid = s.shift_id;
  if (typeof sid === "number" || typeof sid === "string") return String(sid);
  const n = pickNum(s, "id");
  if (typeof n === "number") return String(n);
  const t = pickStr(s, "id");
  return t ?? "";
};

// ここはコンポーネント外（ShiftCard.tsx 先頭のヘルパ群の近く）
type KaipokeInfo = {
  standard_route?: string | null;
  standard_trans_ways?: string | null;
  standard_purpose?: string | null;
  address?: string | null;
  postal_code?: string | null;
};

// ★ 追加：型（ShiftCard.tsx の他の型定義の近く）
type RecordStatus = 'draft' | 'submitted' | 'approved' | 'archived';


// ★ 追加：cs_idごとの情報キャッシュ & 進行中Promiseキャッシュ
const infoCache = new Map<string, { adjId?: string; info: KaipokeInfo }>();
const infoPromiseCache = new Map<string, Promise<{ adjId?: string; info: KaipokeInfo }>>();

function isMyAssignmentRejectMode(s: ShiftData, myId?: string | null) {
  if (!myId) return false;
  return [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(myId);
}

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

/* 簡易キャッシュ（ビルド間で共有しない揮発キャッシュ） */
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

  // 追加：カード内に保持
  const [kaipokeInfo, setKaipokeInfo] = useState<{
    standard_route?: string | null;
    standard_trans_ways?: string | null;
    standard_purpose?: string | null;
    address?: string | null;       // ← 追加
    postal_code?: string | null;
  } | null>(null);


  const shiftIdStr = useMemo(() => getShiftIdStr(shift), [shift]);
  // 1) shift から cs_id を取得（この前提だけに限定）

  const csId = useMemo(() => deepFindKaipokeCsId(shift), [shift]);

  // 2) cs_id -> time_adjustability_id
  const [adjId, setAdjId] = useState<string | undefined>(undefined);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  // ★ 追加：state（コンポーネント内の他の useState 群の近く）
  const [recordStatus, setRecordStatus] = useState<RecordStatus | undefined>(undefined);


  useEffect(() => {
    if (mode !== "reject") return;                 // ★ reject以外は何もしない
    if (__myUserId !== undefined) { setMyUserId(__myUserId); return; }
    if (__myUserIdPromise) { __myUserIdPromise.then(id => setMyUserId(id)); return; }

    __myUserIdPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: me } = await supabase
        .from("users")
        .select("user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      return me?.user_id ?? null;
    })();

    __myUserIdPromise
      .then(id => { __myUserId = id; setMyUserId(id); })
      .finally(() => { __myUserIdPromise = null; });
  }, [mode]);

  // ★ 追加：ステータス取得（コンポーネント内の useEffect 群の近く）
  useEffect(() => {
    if (!shiftIdStr) return;

    (async () => {
      try {
        const q = new URLSearchParams({ ids: shiftIdStr, format: "db" });
        const res = await fetch(`/api/shift-records?${q.toString()}`, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          //alert(`[shift_records] HTTP ${res.status} / id=${shiftIdStr}`);
          return;
        }
        const json = await res.json();
        // バルク形式（配列）を想定、単発でも status は拾えるよう保険
        const raw = Array.isArray(json) ? json[0]?.status : json?.status;
        const s = raw as ("draft" | "submitted" | "approved" | "archived" | undefined);

        setRecordStatus(s);
        // 取得結果の可視化
        //alert(`[shift_records] ok  id=${shiftIdStr}  status=${s ?? "(none)"}`);
      } catch (e) {
        void e
        //alert(`[shift_records] fetch error id=${shiftIdStr}  ${String(e)}`);
      }
    })();
  }, [shiftIdStr]);

  // null = まだ未判定 / 取得失敗（判定不能）
  const [myServiceKeys, setMyServiceKeys] = useState<ServiceKey[] | null>(null);
  useEffect(() => {
    (async () => {
      // 既にキャッシュがあれば即反映
      if (__keysCache !== undefined) { setMyServiceKeys(__keysCache); return; }
      // 進行中があれば待つ
      if (__keysPromise) {
        try { const keys = await __keysPromise; __keysCache = keys; setMyServiceKeys(keys); }
        catch { __keysCache = null; setMyServiceKeys(null); }
        return;
      }
      // ここから初回取得
      __keysPromise = (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("no user");

        const { data: me } = await supabase
          .from("form_entries")
          .select("attachments")
          .eq("auth_uid", user.id)
          .maybeSingle();

        const attachments: Attachment[] = Array.isArray(me?.attachments) ? (me!.attachments as Attachment[]) : [];
        const isCertificateAttachment = (a: Attachment | null | undefined): a is Attachment => {
          if (!a) return false;
          const t = (a.type ?? "").toLowerCase(); const l = (a.label ?? "").toLowerCase();
          return ["資格", "certificate", "certification"].some(k => t.includes(k) || l.includes(k));
        };
        const certDocs: DocItem[] = attachments.filter(isCertificateAttachment).map(a => ({
          id: a.id, url: a.url, label: a.label ?? null, type: "資格証明書",
          mimeType: a.mimeType ?? null, uploaded_at: a.uploaded_at ?? null,
          acquired_at: a.acquired_at ?? a.uploaded_at ?? null,
        }));

        const { data: master } = await supabase
          .from("user_doc_master")
          .select("category,label,is_active,sort_order,service_key:doc_group")
          .order("sort_order", { ascending: true });

        const keys = determineServicesFromCertificates(certDocs, (master ?? []) as CertMasterRow[]) ?? [];
        return keys;
      })();

      try { const keys = await __keysPromise; __keysCache = keys; setMyServiceKeys(keys); }
      catch { __keysCache = null; setMyServiceKeys(null); }
      finally { __keysPromise = null; }
    })();
  }, []);

  const eligible = useMemo(() => {
    const key = pickNonEmptyString(shift, ["require_doc_group"]) ?? "";
    if (!key) return true;                  // 未設定＝資格不要
    if (myServiceKeys === null) return true; // 判定不能＝警告しない
    return myServiceKeys.includes(key as ServiceKey);
  }, [shift, myServiceKeys]);

  useEffect(() => {
    if (!csId) { setAdjId(undefined); return; }

    // ★ requestモードではここで先読みしない（遅延に任せる）
    if (mode !== "reject") return;

    // ★ まずキャッシュ確認
    if (infoCache.has(csId)) {
      const c = infoCache.get(csId)!;
      setKaipokeInfo(c.info);
      setAdjId(c.adjId);
      return;
    }

    // ★ Promiseキャッシュ（同時多発リクエストを1つにまとめる）
    let p = infoPromiseCache.get(csId);
    if (!p) {
      p = (async () => {
        const { data } = await supabase
          .from(kaipokeInfoTableName)
          .select("time_adjustability_id, standard_route, standard_trans_ways, standard_purpose, address, postal_code")
          .eq("kaipoke_cs_id", csId)
          .maybeSingle();

        const rec = (data ?? {}) as Record<string, unknown>;
        const info: KaipokeInfo = {
          standard_route: typeof rec.standard_route === "string" ? rec.standard_route : null,
          standard_trans_ways: typeof rec.standard_trans_ways === "string" ? rec.standard_trans_ways : null,
          standard_purpose: typeof rec.standard_purpose === "string" ? rec.standard_purpose : null,
          address: typeof rec.address === "string" ? rec.address : null,
          postal_code: typeof rec.postal_code === "string" ? rec.postal_code : null,
        };
        const id =
          typeof rec.time_adjustability_id === "string" ? rec.time_adjustability_id as string
            : typeof rec.time_adjustability_id === "number" ? String(rec.time_adjustability_id)
              : undefined;

        return { adjId: id, info };
      })();
      infoPromiseCache.set(csId, p);
    }

    p.then(({ adjId, info }) => {
      infoCache.set(csId, { adjId, info });
      setKaipokeInfo(info);
      setAdjId(adjId);
    });
  }, [csId, mode, kaipokeInfoTableName]);


  // ★ ShiftCard 内に置く（setKaipokeInfo / setAdjId を使うため）
  const ensureInfoOnDemand = async () => {
    if (!csId) return;

    // shift内に既に route/trans/purpose があればスキップ（お好みで）
    const hasMini =
      !!pickNonEmptyString(shift, ["standard_route"]) ||
      !!pickNonEmptyString(shift, ["standard_trans_ways"]) ||
      !!pickNonEmptyString(shift, ["standard_purpose"]);
    if (hasMini && kaipokeInfo) return;

    if (infoCache.has(csId)) {
      const c = infoCache.get(csId)!;
      setKaipokeInfo(c.info);
      setAdjId(c.adjId);
      return;
    }

    let p = infoPromiseCache.get(csId);
    if (!p) {
      p = (async () => {
        const { data } = await supabase
          .from(kaipokeInfoTableName)
          .select("time_adjustability_id, standard_route, standard_trans_ways, standard_purpose, address, postal_code")
          .eq("kaipoke_cs_id", csId)
          .maybeSingle();

        const rec = (data ?? {}) as Record<string, unknown>;
        const info: KaipokeInfo = {
          standard_route: typeof rec.standard_route === "string" ? rec.standard_route : null,
          standard_trans_ways: typeof rec.standard_trans_ways === "string" ? rec.standard_trans_ways : null,
          standard_purpose: typeof rec.standard_purpose === "string" ? rec.standard_purpose : null,
          address: typeof rec.address === "string" ? rec.address : null,
          postal_code: typeof rec.postal_code === "string" ? rec.postal_code : null,
        };
        const id =
          typeof rec.time_adjustability_id === "string" ? rec.time_adjustability_id as string
            : typeof rec.time_adjustability_id === "number" ? String(rec.time_adjustability_id)
              : undefined;

        return { adjId: id, info };
      })();
      infoPromiseCache.set(csId, p);
    }

    const { adjId, info } = await p;
    infoCache.set(csId, { adjId, info });
    setKaipokeInfo(info);
    setAdjId(adjId);
  };

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
    const route = pickNonEmptyString(shift, ["standard_route"]) ?? pickNonEmptyString(kaipokeInfo, ["standard_route"]);
    const trans = pickNonEmptyString(shift, ["standard_trans_ways"]) ?? pickNonEmptyString(kaipokeInfo, ["standard_trans_ways"]);
    const purpose = pickNonEmptyString(shift, ["standard_purpose"]) ?? pickNonEmptyString(kaipokeInfo, ["standard_purpose"]);
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
            <Dialog onOpenChange={(open) => { if (open) void ensureInfoOnDemand(); }}>
              <DialogTrigger asChild>
                <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
              </DialogTrigger>
              <DialogPortal>
                <DialogOverlay className="overlay-avoid-sidebar" />
                <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[480px] ml-4 mr-0 modal-avoid-sidebar">
                  <div className="text-sm space-y-2">
                    <div>
                      <strong>通所経路等</strong>
                      <p>{routeText}</p>
                    </div>
                  </div>
                </DialogContent>
              </DialogPortal>
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
              <DialogPortal>
                <DialogOverlay className="overlay-avoid-sidebar" />
                <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[480px] ml-4 mr-0 modal-avoid-sidebar">
                  <div className="text-sm space-y-2">
                    <strong>備考</strong>
                    <p>{biko}</p>
                  </div>
                </DialogContent>
              </DialogPortal>
            </Dialog>
          )}
        </div>
      </>
    );
  };

  // ★ 追加：return の直前（addr/postal/mapsUrl 等の下あたりが分かりやすいです）
  const startIsoForColor = `${shift.shift_start_date}T${(shift.shift_start_time || '00:00').slice(0, 5)}:00`;
  const isPastStart = new Date(startIsoForColor).getTime() < new Date().getTime();

  const isSubmitted = recordStatus === 'submitted';
  const isGreen = isSubmitted || recordStatus === 'approved' || recordStatus === 'archived';
  // Submitted 以外 かつ 開始時刻が過去 → 赤
  const isRed = !isSubmitted && isPastStart;

  const recordBtnColorCls =
    isRed
      ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
      : isGreen
        ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
        : '';

  useEffect(() => {
    if (mode !== "reject") return; // 対象のボタンが出ないモードでは無駄なので早期return
    const el = document.getElementById(`srbtn-${shiftIdStr}`);
    const domClass = el ? el.className : "(not found)";
    void domClass
    /*
    alert(
      [
        "[ShiftCard btn debug]",
        `id=${shiftIdStr}`,
        `status=${recordStatus ?? "(none)"}`,
        `isPastStart=${isPastStart}`,
        `recordBtnColorCls(var)=${recordBtnColorCls || "(empty)"}`,
        `element.className(final)=${domClass}`,
      ].join("  |  ")
    );
    */
  }, [mode, shiftIdStr, recordStatus, isPastStart, recordBtnColorCls]);

  // components/shift/ShiftCard.tsx で return の直前に
// 「requestモードでの露出制御」ブロックを “request のときだけ” に限定
// （＝ view ではカード非表示にならない）
  if (mode === "request") {
    const lso = shift.level_sort_order ?? null;
    const noAssignees = [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id]
      .every(v => !v || v === "-");
    const canShowByLevel = ((lso === null) || (lso < 3500001));
    const canShow = noAssignees || canShowByLevel;
    if (!canShow) return null;
  }

  // reject モード：自分が担当していないカードは非表示
  if (mode === "reject") {
    if (myUserId === null) return null;
    if (!isMyAssignmentRejectMode(shift, myUserId)) return null;
  }

  // ★ ここを return の直前に追加
  const addr =
    pickNonEmptyString(kaipokeInfo, ["address"]) ??
    pickNonEmptyString(shift, ["address"]);

  const postal =
    pickNonEmptyString(kaipokeInfo, ["postal_code"]) ??
    pickNonEmptyString(shift, ["postal_code"]);

  const mapsUrl = addr ? `https://www.google.com/maps?q=${encodeURIComponent(addr)}` : null;

  const ymFromDate = (d?: string | null) =>
    (typeof d === "string" && d.length >= 7) ? d.slice(0, 7) : "";

  const monthlyHref = (cs?: string, ym?: string) =>
    (cs && ym)
      ? `/portal/roster/monthly?kaipoke_cs_id=${encodeURIComponent(cs)}&month=${encodeURIComponent(ym)}`
      : "#";

  /* ------- Render ------- */
  return (
    <Card
      className={[
        "shadow",
        (!eligible ? "bg-gray-100" : ""),
        (eligible && showBadge ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : ""),
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
        {(mode === "reject" || mode === "view") ? (
          // Rejectモード時は 住所リンク を表示
          <div className="text-sm">
            住所: {addr ? (
              <a
                href={mapsUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600"
                title="Googleマップで開く"
              >
                {addr}
              </a>
            ) : "—"}
            {postal && <span className="ml-2">（{postal}）</span>}
          </div>
        ) : (
          // それ以外のモード（requestなど）は従来通り
          <>
            <div className="text-sm">郵便番号: {postal ?? "—"}</div>
            <div className="text-sm">エリア: {shift.district ?? "—"}</div>
          </>
        )}

        <div className="mt-2 space-y-1">
          <MiniInfo />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {mode === "request" ? (
                <Button onClick={() => setOpen(true)}>このシフトを希望する</Button>
              ) : (
                <Button className={REJECT_BTN_CLASS} onClick={() => setOpen(true)}>
                  このシフトに入れない
                </Button>
              )}
            </DialogTrigger>
            <DialogPortal>
              <DialogOverlay className="overlay-avoid-sidebar" />
              <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[480px] sm:mx-auto ml-4 mr-0">
                {mode === "request" && !eligible && (
                  <div className="mt-3 text-sm text-red-600 font-semibold">
                    保有する資格ではこのサービスに入れない可能性があります。マネジャーに確認もしくは、保有資格の確認をポータルHomeで行ってください。
                  </div>
                )}
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
            </DialogPortal>
          </Dialog>
          {(mode === "reject" || mode === "view") && (
            <Button
              asChild
              variant="ghost"  
              className={recordBtnColorCls || "bg-gray-100 text-black border-gray-300"}
              id={`srbtn-${shiftIdStr}`}  
            >
              <ShiftRecordLinkButton
                id={`srbtn-${shiftIdStr}`}
                className={recordBtnColorCls || "bg-gray-100 text-black border-gray-300"}
                variant="ghost"
                shiftId={getShiftIdStr(shift)}
                clientName={shift.client_name ?? ""}
                tokuteiComment={shift.tokutei_comment ?? ""}
                standardRoute={kaipokeInfo?.standard_route ?? ""}
                standardTransWays={kaipokeInfo?.standard_trans_ways ?? ""}
                standardPurpose={kaipokeInfo?.standard_purpose ?? ""}
                staff01UserId={shift.staff_01_user_id ?? ""}
                staff02UserId={shift.staff_02_user_id ?? ""}
                staff03UserId={shift.staff_03_user_id ?? ""}
                staff02AttendFlg={shift.staff_02_attend_flg ?? ""}
                staff03AttendFlg={shift.staff_03_attend_flg ?? ""}
              />
            </Button>
          )}
          {/* ▼ 追加：月間 */}
          {csId && shift.shift_start_date && (
            <Button variant="secondary" asChild>
              <Link href={monthlyHref(csId, ymFromDate(shift.shift_start_date))}>月間</Link>
            </Button>
          )}
          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
