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
  standardRoute?: string;
  standardTransWays?: string;
  standardPurpose?: string;
  kodoengoPlanLink?: string;
};

type UnknownRecord = Record<string, unknown>;

type StaffRow = {
  user_id: string;
  last_name_kanji?: string;
  first_name_kanji?: string;
  level_sort?: number | null;
  staff_02_attend_flg?: boolean | null;
  staff_03_attend_flg?: boolean | null;
};

// ★ 追加：駐車場所
type ParkingPlace = {
  id: string;
  serial: number;
  label: string;
  location_link: string | null;
  parking_orientation: string | null;
  remarks: string | null;
  permit_required: boolean | null;
  police_station_place_id: string | null;
};

// ★ 追加：cs_idごとの駐車情報キャッシュ（チラつき防止）
const parkingCache = new Map<string, ParkingPlace[]>();
const parkingPromiseCache = new Map<string, Promise<ParkingPlace[]>>();



const formatName = (r?: StaffRow) =>
  r ? `${r.last_name_kanji ?? ""} ${r.first_name_kanji ?? ""}`.trim() || r.user_id : "—";

/* ---------- helpers ---------- */
const DEFAULT_BADGE_TEXT = "時間調整可能";
const TBL_INFO = "cs_kaipoke_info";
const TBL_ADJ = "cs_kaipoke_time_adjustability";

const REJECT_BTN_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-9 px-4 py-2 " +
  "bg-purple-600 hover:bg-purple-700 text-white border border-purple-600";

// ShiftData から judo_ido（なければ shiftInfo.*）を必ず string にして返す
const getJudoIdoStr = (s: ShiftData): string => {
  // 1) トップレベル（getShiftIdStr と同じ手順）
  const jid = (s as unknown as { judo_ido?: number | string }).judo_ido;
  if (typeof jid === "number" || typeof jid === "string") return String(jid);
  const n = pickNum(s, "judo_ido");
  if (typeof n === "number") return String(n);
  const t = pickStr(s, "judo_ido");
  if (t != null) return t;

  // 2) 最小のネスト対応（shiftInfo）
  const info = (s as unknown as {
    shiftInfo?: { judo_ido_num?: number | string; judo_ido?: number | string };
  }).shiftInfo;
  if (info) {
    const v = info.judo_ido_num ?? info.judo_ido;
    if (typeof v === "number" || typeof v === "string") return String(v);
  }

  // 3) 見つからなければ空文字
  return "";
};

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
  kodoengoPlanLink?: string;
  address?: string | null;
  postal_code?: string | null;
  kodoengo_plan_link?: string | null;
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

// ★ 追加：拡張子で画像扱いするか
function isImageUrl(u?: string | null) {
  if (!u) return false;
  const s = u.toLowerCase().split("?")[0];
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].some(ext => s.endsWith(ext));
}

// ★ 追加：駐車場所を取得（API経由）
async function fetchActiveParkingPlaces(csId: string, accessToken?: string) {
  // キャッシュ優先
  if (parkingCache.has(csId)) return parkingCache.get(csId)!;

  // 進行中Promiseがあれば待つ
  const inflight = parkingPromiseCache.get(csId);
  if (inflight) return await inflight;

  const p = (async () => {
    const res = await fetch(`/api/parking/cs_places/by-client?cs_id=${encodeURIComponent(csId)}`, {
      method: "GET",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
    });

    const json: unknown = await res.json();
    if (
      !res.ok ||
      typeof json !== "object" ||
      json === null ||
      !("ok" in json) ||
      (json as { ok: unknown }).ok !== true
    ) {
      const msg =
        typeof json === "object" && json !== null && "message" in json
          ? String((json as { message?: unknown }).message ?? "fetch parking failed")
          : "fetch parking failed";
      throw new Error(msg);
    }

    const rows =
      "rows" in json && Array.isArray((json as { rows?: unknown }).rows)
        ? ((json as { rows: ParkingPlace[] }).rows ?? [])
        : [];

    parkingCache.set(csId, rows);
    return rows;
  })();

  parkingPromiseCache.set(csId, p);

  try {
    return await p;
  } finally {
    parkingPromiseCache.delete(csId);
  }
}

// unknown オブジェクトから安全に string を取得
const getString = (obj: unknown, key: string): string | undefined => {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" && v.trim() ? v : undefined;
  }
  return undefined;
};

// 最初の「空でない文字列」を返す
const pickNonEmpty = (...vals: Array<string | undefined | null>) =>
  vals.find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? "";

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
    kodoengo_plan_link?: string | null;
  } | null>(null);


  const shiftIdStr = useMemo(() => getShiftIdStr(shift), [shift]);
  // 1) shift から cs_id を取得（この前提だけに限定）

  const csId = useMemo(() => deepFindKaipokeCsId(shift), [shift]);

  // 2) cs_id -> time_adjustability_id
  const [adjId, setAdjId] = useState<string | undefined>(undefined);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  // ★ 追加：state（コンポーネント内の他の useState 群の近く）
  const [recordStatus, setRecordStatus] = useState<RecordStatus | undefined>(undefined);

  // 他の useEffect 群の近くに追加
  const [staffMap, setStaffMap] = useState<Record<string, StaffRow>>({});

  // ★ 追加：駐車情報UI
  const [parkingOpen, setParkingOpen] = useState(false);
  const [parkingPlaces, setParkingPlaces] = useState<ParkingPlace[]>([]);
  const [parkingSelectedId, setParkingSelectedId] = useState<string>("");
  void parkingSelectedId;
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingError, setParkingError] = useState<string | null>(null);
  const [parkingSending, setParkingSending] = useState(false);
  const [hasActiveParking, setHasActiveParking] = useState<boolean>(false);


  useEffect(() => {
    if (!(mode === "view" || mode === "reject")) { setStaffMap({}); return; }

    const ids = [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id]
      .filter((v): v is string => !!v && v !== "-");

    if (ids.length === 0) { setStaffMap({}); return; }

    (async () => {
      const { data, error } = await supabase
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji,level_sort")
        .in("user_id", ids);

      if (error) { setStaffMap({}); return; }
      const map: Record<string, StaffRow> = {};
      (data ?? []).forEach((r) => { map[r.user_id] = r as StaffRow; });
      setStaffMap(map);
    })();
  }, [mode, shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id]);



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
    // ★ request 以外（= reject / view）はここで先読みする
    if (mode === "request") return;

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
          .select("time_adjustability_id, standard_route, standard_trans_ways, standard_purpose, address, postal_code, kodoengo_plan_link")
          .eq("kaipoke_cs_id", csId)
          .maybeSingle();

        const rec = (data ?? {}) as Record<string, unknown>;
        const info: KaipokeInfo = {
          standard_route: typeof rec.standard_route === "string" ? rec.standard_route : null,
          standard_trans_ways: typeof rec.standard_trans_ways === "string" ? rec.standard_trans_ways : null,
          standard_purpose: typeof rec.standard_purpose === "string" ? rec.standard_purpose : null,
          address: typeof rec.address === "string" ? rec.address : null,
          postal_code: typeof rec.postal_code === "string" ? rec.postal_code : null,
          kodoengo_plan_link: typeof rec.kodoengo_plan_link === "string" ? rec.kodoengo_plan_link : null,
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
        {mode === "request" && (
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
        )}
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

  // ★ 追加：rejectモードのときだけ、is_active 駐車情報があるか先読み
  useEffect(() => {
    if (mode !== "reject") return;
    if (!csId) { setHasActiveParking(false); return; }

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        const rows = await fetchActiveParkingPlaces(csId, accessToken);
        setHasActiveParking(rows.length > 0);
      } catch {
        // 取れない時は出さない（reject画面を壊さない）
        setHasActiveParking(false);
      }
    })();
  }, [mode, csId]);

  // components/shift/ShiftCard.tsx で return の直前に
  if (mode === "request") {
    const cs = csId ?? "";
    const service =
      pickNonEmptyString(shift, ["shift_service_code", "service_code"]) ?? "";

    // ① kaipoke_cs_id が 999999999* → 非表示
    if (cs.startsWith("999999999")) return null;

    // ② サービスが「その他」 → 非表示
    if (service === "その他") return null;

    // ③ サービス名に「キャンセル」を含む → 非表示
    if (service.includes("キャンセル")) return null;

    // === 既存の表示条件（必要なら残す）========================
    //const lso = shift.level_sort_order ?? null;
    //const noAssignees = [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id]
    //  .every((v) => !v || v === "-");

    // lso が取れた時だけしきい値判定。取れないなら true 扱い（従来通り）
    //const canShowByLevel = (lso === null) || (lso < 3_500_001);
    //const canShowLegacy = noAssignees || canShowByLevel;
    // ========================================================

    // === 追加：staff_01/02/03 の level_sort + attend 条件 ===
    // 必要な user_id が staffMap に読み込まれているかを確認
    /*
    const idsNeeded = [
      shift.staff_01_user_id,
      shift.staff_02_user_id,
      shift.staff_03_user_id,
    ].filter((v): v is string => !!v && v !== "-");

    const isLoaded = idsNeeded.length === 0 || idsNeeded.every((id) => staffMap[id] !== undefined);

    // staffMap 未読込の間は「ここで非表示にはしない」＝ true 扱いにして既存条件で流す
    let passByStaff = true;

    if (isLoaded) {
      const s1 = staffMap[shift.staff_01_user_id ?? ""];
      const s2 = staffMap[shift.staff_02_user_id ?? ""];
      const s3 = staffMap[shift.staff_03_user_id ?? ""];


      if ((s1.user_id !== "-" || s1.level_sort >= 5000000) ) return null;

      const eligibleByLevel = (s?: { level_sort?: number }) =>
        (s?.level_sort ?? Number.MAX_SAFE_INTEGER) < 5_000_000;

      // 要件：
      // ・01/02/03 のいずれかに level_sort < 5,000,000 がいる
      // ・02/03 は attend_flg === false のときに表示対象

      passByStaff =
        (shift.staff_01_user_id === "-") ||            // 旧互換：01が "-" のとき表示
        eligibleByLevel(s1) ||
        (eligibleByLevel(s2) && s2.staff_02_attend_flg === false) ||
        (eligibleByLevel(s3) && s3.staff_03_attend_flg === false);
    }

    // 最終判定：従来条件 と 新条件 の両方を満たす
    if (!passByStaff) return null;
    */
  }

  // reject モード：自分が担当していないカードは非表示
  if (mode === "reject") {
    // myUserId の取得前は一瞬判定不能なので描画を抑止（チラつき防止）
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

  const sr = pickNonEmpty(kaipokeInfo?.standard_route, getString(shift, "standard_route"));
  const stw = pickNonEmpty(kaipokeInfo?.standard_trans_ways, getString(shift, "standard_trans_ways"));
  const sp = pickNonEmpty(kaipokeInfo?.standard_purpose, getString(shift, "standard_purpose"));

  const kpl =
    (kaipokeInfo?.kodoengo_plan_link && kaipokeInfo.kodoengo_plan_link.trim()) ?
      kaipokeInfo.kodoengo_plan_link :
      (getString(shift, "kodoengo_plan_link") ?? "");

  const ymFromDate = (d?: string | null) =>
    (typeof d === "string" && d.length >= 7) ? d.slice(0, 7) : "";

  const monthlyHref = (cs?: string, ym?: string) =>
    (cs && ym)
      ? `/portal/shift-view?client=${encodeURIComponent(cs)}&date=${encodeURIComponent(ym)}-01`
      : "#";



  // ★ 追加：駐車ダイアログを開く（必要なら取得）
  const openParkingDialog = async () => {
    if (!csId) return;
    setParkingError(null);
    setParkingOpen(true);

    // 既に state に入ってるならそのまま
    if (parkingPlaces.length > 0) return;

    setParkingLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const rows = await fetchActiveParkingPlaces(csId, accessToken);
      setParkingPlaces(rows);
      const firstId = rows[0]?.id ?? "";
      setParkingSelectedId(firstId);
    } catch (e) {
      setParkingError(e instanceof Error ? e.message : "駐車情報の取得に失敗しました");
    } finally {
      setParkingLoading(false);
    }
  };

  // ★ 追加：許可証申請（LW送信）
  const applyParkingPermit = async (placeId: string) => {
    if (!placeId) return;
    setParkingError(null);
    setParkingSending(true);

    try {
      const ok = window.confirm("「許可証申請」メッセージを送信します。よろしいですか？");
      if (!ok) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch(`/api/parking/permit-apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ parking_cs_place_id: placeId }),
      });

      const json: unknown = await res.json();
      if (
        !res.ok ||
        typeof json !== "object" ||
        json === null ||
        !("ok" in json) ||
        (json as { ok: unknown }).ok !== true
      ) {
        const msg =
          typeof json === "object" && json !== null && "message" in json
            ? String((json as { message?: unknown }).message ?? "apply failed")
            : "apply failed";
        throw new Error(msg);
      }

      alert("送信しました。");
    } catch (e) {
      setParkingError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setParkingSending(false);
    }
  };

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
        {mode === "reject" ? (
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

            {/* ★ 追加：駐車マーク（is_activeがある時だけ） */}
            {hasActiveParking && (
              <button
                type="button"
                className="
                  inline-flex items-center gap-1
                  rounded-md px-2 py-1 text-xs font-semibold
                  bg-emerald-100 text-emerald-800
                  border border-emerald-200
                  hover:bg-emerald-200
                  active:scale-[0.98]
                  shadow-sm hover:shadow
          "
                onClick={() => { void openParkingDialog(); }}
                title="駐車情報（許可証申請）"
              >
                🚗 駐車
              </button>
            )}

          </div>
        ) : (
          <>
            <div className="text-sm">郵便番号: {postal ?? "—"}</div>
            <div className="text-sm">エリア: {shift.district ?? "—"}</div>
          </>
        )}
        <div className="mt-2 space-y-1">
          <MiniInfo />
        </div>
        {(mode === "view" || mode === "reject") && (
          <div className="text-sm mt-2">
            スタッフ：
            <span className="inline-block mr-3">
              {formatName(staffMap[shift.staff_01_user_id ?? ""])}
            </span>
            <span className="inline-block mr-3">
              {formatName(staffMap[shift.staff_02_user_id ?? ""])}
            </span>
            <span className="inline-block">
              {formatName(staffMap[shift.staff_03_user_id ?? ""])}
            </span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {mode === "view" ? (
                null
              ) : mode === "request" ? (
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
          {/* ★ 追加：駐車情報ダイアログ */}
          <Dialog open={parkingOpen} onOpenChange={setParkingOpen}>
            <DialogPortal>
              <DialogOverlay className="overlay-avoid-sidebar" />
              <DialogContent className="z-[110] w-[calc(100vw-32px)] sm:max-w-[760px] sm:mx-auto ml-4 mr-0 max-h-[85vh] overflow-y-auto">
                <DialogTitle>駐車情報</DialogTitle>
                <DialogDescription>
                  駐車場所の地図・向き・備考を確認し、必要なら許可証申請を送信します。
                </DialogDescription>

                {parkingError && (
                  <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                    {parkingError}
                  </div>
                )}

                {parkingLoading ? (
                  <div className="mt-3 text-sm text-gray-600">読み込み中...</div>
                ) : (
                  <>
                    {parkingPlaces.length === 0 ? (
                      <div className="mt-3 text-sm text-gray-600">有効な駐車情報（is_active=true）がありません。</div>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {parkingPlaces.map((p) => {
                          const code = (p.police_station_place_id ?? "").trim();
                          const url = (p.location_link ?? "").trim() || null;

                          // ★許可証が必要 のときだけ申請OK
                          //const canApplyPermit = (p.permit_required === true);

                          return (
                            <div key={p.id} className="rounded-lg border bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="font-semibold text-sm">
                                  {code ? `認識コード：${code} / ` : ""}
                                  {p.serial}. {p.label}
                                </div>

                                {p.permit_required === true ? (
                                  <Button
                                    onClick={() => { void applyParkingPermit(p.id); }}
                                    disabled={parkingSending}
                                    className="bg-amber-500 text-white hover:opacity-90"
                                  >
                                    {parkingSending ? "送信中..." : "許可証申請"}
                                  </Button>
                                ) : (
                                  <div className="rounded-md border px-2 py-1 text-xs text-gray-600">
                                    許可証不要
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="font-semibold">向き</div>
                                  <div>{p.parking_orientation ?? "—"}</div>
                                </div>

                                <div>
                                  <div className="font-semibold">備考</div>
                                  <div className="whitespace-pre-wrap">{p.remarks ?? "—"}</div>
                                </div>
                              </div>

                              <div className="mt-3 text-sm">
                                <div className="font-semibold">地図</div>
                                {!url ? (
                                  <div className="text-gray-600">未登録</div>
                                ) : isImageUrl(url) ? (
                                  <div className="mt-1">
                                    <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                      画像を別タブで開く
                                    </a>
                                    <img
                                      src={url}
                                      alt="地図"
                                      className="mt-2 max-h-[360px] w-full rounded border object-contain"
                                    />
                                  </div>
                                ) : (
                                  <div className="mt-1">
                                    <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                      地図を開く
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div className="flex justify-end pt-2">
                          <Button variant="outline" onClick={() => setParkingOpen(false)}>
                            閉じる
                          </Button>
                        </div>
                      </div>
                    )}

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
                standardRoute={sr}
                standardTransWays={stw}
                standardPurpose={sp}
                kodoengoPlanLink={kpl}
                staff01UserId={shift.staff_01_user_id ?? ""}
                staff02UserId={shift.staff_02_user_id ?? ""}
                staff03UserId={shift.staff_03_user_id ?? ""}
                staff02AttendFlg={shift.staff_02_attend_flg ?? ""}
                staff03AttendFlg={shift.staff_03_attend_flg ?? ""}
                judoIdo={getJudoIdoStr(shift)}
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

