//component/shift/ShiftRecord.tsx
"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { he } from "date-fns/locale";
void he;
//import type { RosterShiftCard } from '@/types/roster' 

// 並び順ユーティリティ
const byAsc = (x?: number, y?: number) => Number(x ?? 0) - Number(y ?? 0);

// ★ 追加: 初期デフォルト保存をレコードごとに1回だけ実行するためのフラグ
const seededDefaultsRef = React.createRef<{ rid: string | null }>();

// ===== ステータスマッピング（APIのenumに合わせて必要なら調整） =====
const STATUS = {
  inProgress: "draft",     // 自動保存
  completed: "submitted",  // 「保存（完了）」ボタン
} as const;

// ===== 型（rules_json / meta_json）=====
// 置き換え（includes_any を追加）
type RuleStringCond = {
  equals?: string;
  includes?: string;
  matches?: string;
  includes_any?: string[]; // ← 追加
};

type RuleWhen = Record<string, RuleStringCond>; // 例: { "service_code": { includes: "身" } }
type RuleSet = { active?: boolean; required?: boolean; default_value?: unknown };
export type ItemRules = { when?: RuleWhen; set?: RuleSet };

type MetaNotify = {
  enabled?: boolean;
  when?: RuleStringCond | Record<string, RuleStringCond>; // 単一または複数キー対応
  target?: "client" | "fixed_channel" | "manager";
  channel_id?: string;
  message?: string;
};
export type ItemMeta = { notify?: MetaNotify };

type RulesJson = ItemRules | ItemRules[] | null;

type LRuleSkipIf = {
  /** このカテゴリ(L)内で、指定 code のいずれかが ON(= truthy) なら、このルールをスキップ */
  any_checked_by_code?: string[];
};

// ===== 型（APIの実体に寄せて最低限の想定。柔らかくしておく） =====
// 置き換え（rules_json を追加）
type LRuleIf = Record<string, RuleStringCond>;
type LRuleCheck = {
  min_checked_in_this_category?: number;
  exclude_items?: { by_code?: string[]; by_name_exact?: string[] };
};
type LRule = {
  id: string;
  if?: LRuleIf;
  check?: LRuleCheck;
  skip_if?: LRuleSkipIf; // ★ 追加
  message?: string;
  severity?: "error" | "warn";
};
type LRulesJson = { version?: number; rules?: LRule[] } | null;

interface MergedInfo extends Record<string, unknown> {
  judo_ido?: string;
  judo_ido_num?: number;
}

export type ShiftRecordCategoryL = {
  id: string;
  code?: string;
  name: string;
  sort_order?: number;
  rules_json?: LRulesJson; // ← 追加
};
export type ShiftRecordCategoryS = { id: string; l_id: string; code?: string; name: string; sort_order?: number };
export type OptionKV = { label: string; value: string };
export type ShiftRecordItemDef = {
  id: string;
  s_id: string; // 紐づくSカテゴリ
  code?: string;
  label: string;
  description?: string;
  input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display";
  required?: boolean;
  sort_order?: number; // 並び順
  // select/checkbox 用
  options?: unknown;
  options_json?: unknown;
  // number用
  min?: number; max?: number; step?: number;
  // display用
  display_text?: string;
  // 共通
  unit?: string; // 単位（末尾に表示）
  default_value?: unknown; // 既定値
  default?: unknown; // 既定値（どちらのキーでも受ける）
  exclusive?: boolean; // 3件以上のcheckboxを排他（ラジオ）にしたい時
  active?: boolean;
  rules_json?: RulesJson;
  meta_json?: ItemMeta | null;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

// ===== ヘルパ（型ガード系） =====
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string { return v == null ? "" : String(v); }

function isRuleStringCond(v: unknown): v is RuleStringCond {
  return isRecord(v)
    && (v.equals === undefined || typeof v.equals === "string")
    && (v.includes === undefined || typeof v.includes === "string")
    && (v.matches === undefined || typeof v.matches === "string")
    && (v.includes_any === undefined || Array.isArray(v.includes_any));
}
function isRuleWhen(v: unknown): v is RuleWhen {
  if (!isRecord(v)) return false;
  return Object.values(v).every(isRuleStringCond);
}
function isRuleSet(v: unknown): v is RuleSet {
  return isRecord(v)
    && (v.active === undefined || typeof v.active === "boolean")
    && (v.required === undefined || typeof v.required === "boolean")
    && ("default_value" in v ? true : true);
}
function isItemRules(v: unknown): v is ItemRules {
  if (!isRecord(v)) return false;
  if (v.when !== undefined && !isRuleWhen(v.when)) return false;
  if (v.set !== undefined && !isRuleSet(v.set)) return false;
  return true;
}

// 正規化: object / array / null → ItemRules[]
function normalizeRules(r: RulesJson | unknown): ItemRules[] {
  if (Array.isArray(r)) return r.filter(isItemRules);
  return isItemRules(r) ? [r] : [];
}

// when評価ヘルパ
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (isRecord(acc) ? (acc as Record<string, unknown>)[k] : undefined), obj);
}
function testStringCond(src: string, cond?: RuleStringCond): boolean {
  if (!cond) return true;
  if (typeof cond.equals === "string" && src !== cond.equals) return false;
  if (typeof cond.includes === "string" && !src.includes(cond.includes)) return false;
  if (Array.isArray(cond.includes_any) && cond.includes_any.length > 0) {
    if (!cond.includes_any.some((needle) => src.includes(String(needle)))) return false; // ← 追加
  }
  if (typeof cond.matches === "string") {
    try { if (!new RegExp(cond.matches).test(src)) return false; } catch { return false; }
  }
  return true;
}
function whenSatisfied(when: RuleWhen | undefined, ctx: Record<string, unknown>): boolean {
  if (!when) return true;
  return Object.keys(when).every((k) => testStringCond(asString(getByPath(ctx, k)), when[k]));
}

// ===== util（その他） =====
function tryParseJSON(v: unknown): unknown {
  if (v == null) return [];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return v;
}
function isOptionKV(obj: unknown): obj is OptionKV {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  return (typeof r.label === "string" || typeof r.label === "number") && (typeof r.value === "string" || typeof r.value === "number");
}
function normalizeOptions(raw: unknown): OptionKV[] {
  const parsed = Array.isArray(raw) ? raw : tryParseJSON(raw);
  const out: OptionKV[] = [];
  if (Array.isArray(parsed)) {
    for (const el of parsed) {
      if (typeof el === "string" || typeof el === "number") {
        const s = String(el);
        out.push({ label: s, value: s });
      } else if (isOptionKV(el)) {
        out.push({ label: String(el.label), value: String(el.value) });
      } else if (el && typeof el === "object") {
        const r = el as Record<string, unknown>;
        const label = String(r.label ?? r.name ?? r.value ?? "");
        const value = String(r.value ?? r.code ?? r.label ?? "");
        if (value) out.push({ label, value });
      }
    }
  }
  return out;
}

function parseCheckboxOptions(
  raw: unknown,
  defExclusive?: boolean
): { items: OptionKV[]; exclusive: boolean; multiple: boolean } {
  const maybeObj = (Array.isArray(raw) || typeof raw !== "object") ? null : (raw as Record<string, unknown>);
  if (maybeObj && Array.isArray(maybeObj.items)) {
    const items = normalizeOptions(maybeObj.items);
    const exclusive = typeof maybeObj.exclusive === "boolean" ? maybeObj.exclusive : !!defExclusive;
    const multiple = typeof maybeObj.multiple === "boolean" ? maybeObj.multiple : false;
    return { items, exclusive, multiple };
  }
  const items = normalizeOptions(raw);
  return { items, exclusive: !!defExclusive, multiple: false };
}

function parseSelectOptions(raw: unknown): { items: OptionKV[]; placeholder?: string } {
  const maybeObj = (Array.isArray(raw) || typeof raw !== "object") ? null : (raw as Record<string, unknown>);
  if (maybeObj && Array.isArray(maybeObj.items)) {
    return {
      items: normalizeOptions(maybeObj.items),
      placeholder: typeof maybeObj.placeholder === "string" ? maybeObj.placeholder : undefined,
    };
  }
  return { items: parseOptionsFlexible(raw), placeholder: undefined };
}

function parseOptionsFlexible(v: unknown): OptionKV[] {
  const parsed = Array.isArray(v) ? v : tryParseJSON(v);
  let optsFlex = normalizeOptions(parsed);
  if (optsFlex.length > 0) return optsFlex;
  if (typeof v === "string") {
    const s = loosenJSONString(v);
    const asArray = coerceToArrayJSON(s);
    const parsed2 = tryParseJSON(asArray);
    optsFlex = normalizeOptions(parsed2);
    if (optsFlex.length > 0) return optsFlex;
    const simple = s.replace(/[／|｜]/g, ",");
    if (!simple.includes("{")) {
      const parts = simple.split(/[\s、,]+/).filter(Boolean);
      if (parts.length >= 2) return parts.slice(0, 2).map((p, i) => ({ label: p, value: String(i) }));
    }
    const kv = simple.split(/[\s、,]+/).map((t) => t.split(":"));
    if (kv.every((x) => x.length === 2)) return kv.map(([k, v2]) => ({ label: k, value: String(v2) }));
  }
  return [];
}

function loosenJSONString(input: string): string {
  return input.replace(/[“”＂]/g, '"').replace(/[‘’＇]/g, "'").replace(/，/g, ",").trim();
}

function coerceToArrayJSON(s: string): string {
  const t = s.trim();
  if (t.startsWith("[") && t.endsWith("]")) return t;
  if (t.startsWith("{") && t.endsWith("}")) {
    const withCommas = t.replace(/}\s*{/g, "},{");
    return `[${withCommas}]`;
  }
  return t;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    const s = v.trim(); if (!s) return [];
    try { const j = JSON.parse(s); if (Array.isArray(j)) return j.map(String); } catch { /* noop */ }
    return s.includes(",") ? s.split(",").map(x => x.trim()).filter(Boolean) : [s];
  }
  return [];
}

function useShiftInfo(shiftId: string) {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!shiftId) return;
    (async () => {
      const r = await fetch(`/api/shift-custom-view?shift_id=${encodeURIComponent(shiftId)}&expand=staff`);
      if (r.ok) setInfo(await r.json());
    })();
  }, [shiftId]);
  return info;
}

function renderTemplate(tpl: string, ctx: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    if (!Object.prototype.hasOwnProperty.call(ctx, key)) return "";
    const v = (ctx as Record<string, unknown>)[key];
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  });
}

function resolveDefaultValue(
  def: ShiftRecordItemDef,
  ctx: Record<string, unknown> | null,
  allValues: Record<string, unknown>,
  codeToId: Record<string, string>,
  idToDefault: Record<string, unknown>
): unknown {
  const raw = typeof def.default_value !== "undefined" ? def.default_value : def.default;
  if (raw == null) return raw;

  // 1) "me.X" → X の item を参照。未保存なら idToDefault[X] を使う
  // 1) "me.X" → code優先で探し、無ければ item_def_id 直指定も許容
  const pickMe = (ref: string): unknown => {
    const refId =
      codeToId[ref] ??
      (Object.prototype.hasOwnProperty.call(allValues, ref) ? ref :
        Object.prototype.hasOwnProperty.call(idToDefault, ref) ? ref : undefined);

    if (!refId) return "";
    const saved = allValues[refId];
    if (saved !== "" && saved != null) return saved;
    return idToDefault[refId] ?? "";
  };

  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("me.")) return pickMe(s.slice(3));
    if (ctx && /\{\{.+\}\}/.test(s)) return renderTemplate(s, ctx);
    return raw;
  }

  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    const byCode =
      (typeof r.me_by_code === "string" && r.me_by_code) ||
      (typeof r.me === "string" && r.me) || undefined;
    if (byCode) return pickMe(byCode);

    if (typeof r.ref === "string" && ctx) {
      const v = r.ref.split(".").reduce<unknown>(
        (acc, k) => (typeof acc === "object" && acc !== null && !Array.isArray(acc) ? (acc as Record<string, unknown>)[k] : undefined),
        ctx
      );
      return v == null ? "" : String(v);
    }
    if (typeof r.template === "string" && ctx) return renderTemplate(r.template, ctx);
  }
  return raw;
}

const isTruthyValue = (val: unknown): boolean => {
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "string") return val.trim() !== "" && val !== "0";
  if (typeof val === "number") return !Number.isNaN(val) && String(val) !== "0";
  if (typeof val === "boolean") return val;
  return !!val;
};

/*
function isTruthyOne(v: unknown) {
  if (v === 1 || v === "1" || v === true) return true;
  if (v === "true" || v === "on" || v === "はい" || v === "有") return true;
  return false;
}
*/

// JSON安全パース
function safeParseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;

  // すでにオブジェクトの場合（DBがJSONとして返すケース）
  if (typeof raw === "object") {
    return raw as T;
  }

  // 文字列の場合のみ JSON.parse
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // それ以外の型は非対応
  return null;
}

// 入力が“実質的に”空じゃないか
function hasNonEmpty(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== "0"; // "0" は意図的に未入力扱い（必要なら外してOK）
}

// 発火オプションの型
type LwOptions = { lw_connect?: boolean };

// LW連携フラグを「定義」から判定（code=lw_connect もOK）
function isLwConnectDef(def: ShiftRecordItemDef): boolean {
  if ((def.code ?? "") === "lw_connect") return true;
  const raw = typeof def.options_json !== "undefined" ? def.options_json : def.options;
  const opt = safeParseJson<LwOptions>(raw);
  return opt?.lw_connect === true;
}

function shouldConnectLW(
  defs: ShiftRecordItemDef[],
  values: Record<string, unknown>
): boolean {
  const find = (code: string) => defs.find(d => d.code === code);

  // A) 固定スイッチ：code=lw_connect（値が入っていれば発火）
  const dConnect = find("lw_connect");
  if (dConnect && hasNonEmpty(values[dConnect.id])) return true;

  // B) 任意項目：options または options_json に { "lw_connect": true } があり、
  //    かつ当該項目に値が入っていれば発火
  for (const d of defs) {
    const rawOpts = (typeof d.options_json !== "undefined" ? d.options_json : d.options);
    const opts = safeParseJson<LwOptions>(rawOpts);
    if (opts?.lw_connect === true && hasNonEmpty(values[d.id])) {
      // デバッグしたければ↓のalertを一時的に有効化
      // alert(`[LW DEBUG] trigger by ${d.code ?? d.id} value="${String(values[d.id]).slice(0,40)}"`);
      return true;
    }
  }

  // C) 予備：code=lw_channel_id が非空なら発火
  const dChan = find("lw_channel_id");
  if (dChan && hasNonEmpty(values[dChan.id])) return true;

  return false;
}

// 訪問記録フォームの入力値を、そのままLWメッセージ本文へ整形する。
// 特記事項サマリは次回シフト用の補助情報なので、LW連携本文には使わない。
function buildVisitRecordMessage(
  defs: ShiftRecordItemDef[],
  values: Record<string, unknown>,
  categoryNames: Record<string, string>
): string {
  const seen = new Set<string>();
  const rows: Array<{ category: string; label: string; value: string }> = [];

  const formatValue = (def: ShiftRecordItemDef, raw: unknown): string => {
    const optionsRaw = def.options ?? def.options_json;
    const options = def.input_type === "checkbox"
      ? parseCheckboxOptions(optionsRaw, def.exclusive).items
      : def.input_type === "select"
        ? parseSelectOptions(optionsRaw).items
        : [];

    if (Array.isArray(raw)) {
      const selected = raw.map(String).map((v) => options.find((o) => o.value === v)?.label ?? v).filter(Boolean);
      return selected.join("、");
    }

    const value = String(raw ?? "").trim();
    if (!value) return "";
    if (options.length > 0) {
      const matched = options.find((o) => o.value === value);
      if (matched) return matched.label;
    }
    if (def.input_type === "checkbox" && value === "1") return "はい / 実施";
    return def.unit ? `${value}${def.unit}` : value;
  };

  for (const def of defs) {
    if (seen.has(def.id) || def.input_type === "display") continue;
    seen.add(def.id);
    if (def.code === "lw_connect" || def.code === "lw_channel_id") continue;
    if (!Object.prototype.hasOwnProperty.call(values, def.id)) continue;

    const value = formatValue(def, values[def.id]);
    if (!value) continue;
    rows.push({
      category: categoryNames[def.s_id] ?? "訪問記録",
      label: def.label,
      value,
    });
  }

  if (rows.length === 0) return "（入力内容なし）";

  const grouped = new Map<string, Array<{ label: string; value: string }>>();
  for (const row of rows) {
    const items = grouped.get(row.category) ?? [];
    items.push({ label: row.label, value: row.value });
    grouped.set(row.category, items);
  }

  return Array.from(grouped.entries())
    .map(([category, items]) => [
      `【${category}】`,
      ...items.map((item) => `・${item.label}: ${item.value}`),
    ].join("\n"))
    .join("\n");
}


// 「状況】」の直後〜「【指示】」の直前を抽出
function extractTokuteiStatusSlice(raw: string): string {
  const s = String(raw ?? "").replace(/\r\n/g, "\n");
  const m1 = s.match(/状況】/); // 例: 「【前回の状況】」などもヒット
  const start = m1 ? s.indexOf(m1[0]) + m1[0].length : 0;
  const end = s.indexOf("【指示】", start);
  const seg = s.slice(start, end === -1 ? undefined : end);
  // 先頭の空行や空白を落として整形
  return seg.replace(/^[ \t]*\n+/, "").trim();
}

const TOKUTEI_DEBUG = false;
// === テストモード: 実送信しない ===
const TEST_MODE = false;

// 特記事項サマリを生成して本文を抽出して返す
async function fetchTokuteiSummarySlice(shiftId: string): Promise<string> {
  try {
    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      //alert(`[TOKUTEI][client] POST /api/tokutei/sum-order\nshiftId=${shiftId}`);
    }

    const res = await fetch("/api/tokutei/sum-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift_id: Number(shiftId) }),
    });

    // レスポンス一次情報
    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      //alert(`[TOKUTEI][client] res.ok=${res.ok} status=${res.status}`);
    }
    if (!res.ok) return "";

    // 生テキストも確認（json前に clone で生テキストを取る）
    const rawText = await res.clone().text().catch(() => "");
    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      const head = rawText.slice(0, 300);
      void head;
      //alert(`[TOKUTEI][client] rawText(len=${rawText.length})\n---\n${head}\n---`);
    }

    // 期待キーのどれかを拾う
    type TokuteiResponse = {
      summary?: string;
      text?: string;
      content?: string;
      body?: string;
      [k: string]: unknown;
    };
    const j: TokuteiResponse | null = await res.json().catch(() => null);

    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      const keys = j ? Object.keys(j) : [];
      void keys;
      //alert(`[TOKUTEI][client] json keys: ${keys.join(",") || "(none)"}`);
    }

    const raw = String(
      j?.summary ?? j?.text ?? j?.content ?? j?.body ?? ""
    );

    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      const head = raw.slice(0, 200).replace(/\n/g, "\\n");
      void head;
      //alert(`[TOKUTEI][client] picked raw(len=${raw.length}) head="${head}"`);
    }

    const slice = extractTokuteiStatusSlice(raw);

    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      const head = slice.slice(0, 200).replace(/\n/g, "\\n");
      void head;
      //alert(`[TOKUTEI][client] slice(len=${slice.length}) head="${head}"`);
    }

    return slice;
  } catch (e) {
    void e;
    if (TOKUTEI_DEBUG && typeof window !== "undefined") {
      //alert(`[TOKUTEI][client] exception: ${e instanceof Error ? e.message : String(e)}`);
    }
    return "";
  }
}

// 先頭固定文（共通で使う）
const LW_HEADER =
  "🧾 訪問記録の内容を連携します。対応が必要な場合があります。確認して対応をしてください。";


// ShiftRecord.tsx 内
async function postToLW(channelId: string, text: string) {

  if (TEST_MODE) {
    alert(
      `[LWテストモード]\n\n` +
      `送信先チャンネルID:\n${channelId}\n\n` +
      `送信内容:\n${text}`
    );
    return; // ← 実送信はスキップ
  }

  // === 通常モード（本番運用） ===
  const res = await fetch("/api/lw-send-botmessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, text }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    alert(`[LW] 送信失敗\nstatus=${res.status}\n${msg}`);
  } else {
    alert("[LW] メッセージ送信成功");
  }
}


// ShiftRecord.tsx 先頭のユーティリティ群の近くに追記
async function resolveChannelIdForClient(
  values: Record<string, unknown>,
  defs: ShiftRecordItemDef[],
  info: Record<string, unknown> | null
): Promise<string | null> {
  // 0) フォームの lw_channel_id が入っていれば最優先で使う
  const defChan = defs.find(d => d.code === "lw_channel_id");
  if (defChan) {
    const raw = values[defChan.id];
    const s = raw == null ? "" : String(raw).trim();
    if (s) return s; // これが最優先
  }

  // 1) 既存ロジック：mergedInfo(=shiftInfo) から group_account/kaipoke_cs_id を見て Supabase で解決
  const gi = (info ?? {}) as Record<string, unknown>;
  try {
    const { data, error } = await supabase
      .from("group_lw_channel_view")
      .select("channel_id")
      // group_account = kaipoke_cs_id 連携
      .eq("group_account", gi.kaipoke_cs_id)
      .maybeSingle();

    if (error) {
      console.warn("[LW] channel_id lookup error:", error);
      return null;
    }
    return (data?.channel_id as string) || null;
  } catch (e) {
    console.error("[LW] channel_id lookup exception:", e);
    return null;
  }
}


export default function ShiftRecord({
  shiftId,
  recordId,
  onSavedStatusChange,
}: {
  shiftId: string;
  recordId?: string;
  onSavedStatusChange?: (s: SaveState) => void;
}) {
  const sp = useSearchParams();
  const clientNameFromQS = sp.get("client_name") || undefined;
  const shiftInfo = useShiftInfo(shiftId);

  // 追加（5項目）
  const qsStaff01UserId = sp.get("staff_01_user_id") || undefined;
  const qsStaff02UserId = sp.get("staff_02_user_id") || undefined;
  const qsStaff03UserId = sp.get("staff_03_user_id") || undefined;
  const qsStaff02AttendFlg = sp.get("staff_02_attend_flg") || undefined;
  const qsStaff03AttendFlg = sp.get("staff_03_attend_flg") || undefined;
  const qsTokuteiComment = sp.get("tokutei_comment") || undefined;


  // 追加
  const qsStandardRoute = sp.get("standard_route") || undefined;
  const qsStandardTransWays = sp.get("standard_trans_ways") || undefined;
  const qsStandardPurpose = sp.get("standard_purpose") || undefined;

  const qsKodoengoPlanLink = sp.get("kodoengo_plan_link") || undefined;

  const qsJudoIdo = sp.get("judo_ido") || undefined;

  const router = useRouter();

  // すでに sp は使っているので同居でOK
  const qsReturnTo = sp.get("return_to") || null;
  const storageReturnTo =
    typeof window !== "undefined"
      ? (sessionStorage.getItem("sr:return_to") || null)
      : null;
  const returnTo = qsReturnTo || storageReturnTo;

  // ===== 追加: ステータス管理用の state =====
  const [status, setStatus] = useState<string>("draft"); // ★★ 追加：現在のstatus保持


  // handleClose を上で定義している箇所を以下に置き換え（確認ダイアログ対応）
  const handleClose = useCallback(() => {
    // ★★ 追加: draft の場合は閉じる前に警告
    if ((status || "draft") === "draft") {
      const ok = window.confirm("この記録は下書き（draft）のままです。保存（完了）せずに閉じますか？");
      if (!ok) return;
    }

    // 既存の遷移ロジックはそのまま
    if (returnTo) {
      router.push(returnTo);
      try { sessionStorage.removeItem("sr:return_to"); } catch { }
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/portal/shift-view");
  }, [returnTo, router, status]); // ★★ 依存に status を追加


  // 既存 mergedInfo を拡張
  const mergedInfo = useMemo(() => {
    const base: MergedInfo = { ...(shiftInfo ?? {}) };
    //alert(`[ShiftRecord] mergedInfo start\nbase=${JSON.stringify(base)}`);

    // client_name（API空ならQSで補完）
    {
      const qs = (clientNameFromQS ?? "").trim();
      const api = typeof base.client_name === "string" ? String(base.client_name).trim() : "";
      if (qs && !api) base.client_name = qs;
    }

    // standard_*（API空ならQSで補完）
    {
      const apiRoute = typeof base.standard_route === "string" ? String(base.standard_route).trim() : "";
      const apiTrans = typeof base.standard_trans_ways === "string" ? String(base.standard_trans_ways).trim() : "";
      const apiPurpose = typeof base.standard_purpose === "string" ? String(base.standard_purpose).trim() : "";
      if (qsStandardRoute && !apiRoute) base.standard_route = qsStandardRoute;
      if (qsStandardTransWays && !apiTrans) base.standard_trans_ways = qsStandardTransWays;
      if (qsStandardPurpose && !apiPurpose) base.standard_purpose = qsStandardPurpose;
    }

    {
      const apiKodoLink = typeof base.kodoengo_plan_link === "string" ? String(base.kodoengo_plan_link).trim() : "";
      if (qsKodoengoPlanLink && !apiKodoLink) base.kodoengo_plan_link = qsKodoengoPlanLink;
    }

    {
      const raw = (qsJudoIdo ?? (typeof base.judo_ido === "string" ? base.judo_ido : "")).toString();
      if (!base.judo_ido && qsJudoIdo) base.judo_ido = qsJudoIdo;

      const onlyDigits = raw.replace(/[^\d]/g, "");
      if (onlyDigits) {
        const n = Number(onlyDigits);
        if (!Number.isNaN(n)) base.judo_ido_num = n;
      }
    }

    // ★ staff_xxx / attend_flg（API空ならQSで補完）
    const setIfEmpty = (k: string, v?: string) => {
      const cur = (base as Record<string, unknown>)[k];
      const has = (typeof cur === "string" && cur.trim() !== "") || cur != null;
      if (!has && v != null) (base as Record<string, unknown>)[k] = v;
    };
    setIfEmpty("staff_01_user_id", qsStaff01UserId);
    setIfEmpty("staff_02_user_id", qsStaff02UserId);
    setIfEmpty("staff_03_user_id", qsStaff03UserId);
    setIfEmpty("staff_02_attend_flg", qsStaff02AttendFlg);
    setIfEmpty("staff_03_attend_flg", qsStaff03AttendFlg);
    setIfEmpty("tokutei_comment", qsTokuteiComment);

    return base;
  }, [
    shiftInfo, clientNameFromQS,
    qsStandardRoute, qsStandardTransWays, qsStandardPurpose,
    qsKodoengoPlanLink,
    qsStaff01UserId, qsStaff02UserId, qsStaff03UserId, qsStaff02AttendFlg, qsStaff03AttendFlg,
    qsTokuteiComment, qsJudoIdo
  ]);

  // ====== 定義ロード ======
  const [defs, setDefs] = useState<{ L: ShiftRecordCategoryL[]; S: ShiftRecordCategoryS[]; items: ShiftRecordItemDef[] }>(
    { L: [], S: [], items: [] }
  );
  const [loadingDefs, setLoadingDefs] = useState(true);
  const [defsError, setDefsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingDefs(true);
        const [l, s, d] = await Promise.all([
          fetch("/api/shift-record-def/category-l", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/shift-record-def/category-s", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/shift-record-def/item-defs", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!cancelled) setDefs({ L: l ?? [], S: s ?? [], items: d ?? [] });
      } catch {
        if (!cancelled) setDefsError("定義の取得に失敗しました");
      } finally {
        if (!cancelled) setLoadingDefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ====== レコードの確保（既存 or 新規ドラフト） ======
  const [rid, setRid] = useState<string | undefined>(recordId);
  const [values, setValues] = useState<Record<string, unknown>>({}); // key = item_def_id
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [recordLocked, setRecordLocked] = useState<boolean>(false); // 完了後にロック
  useEffect(() => { onSavedStatusChange?.(saveState); }, [saveState, onSavedStatusChange]);

  // recordLocked 定義のすぐ下あたりに追加
  const [meUserId, setMeUserId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  // 現在ユーザー取得
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMeUserId(null); setMeRole(null); return; }
        const { data: me } = await supabase
          .from("users")
          .select("user_id, system_role")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        setMeUserId(me?.user_id ?? null);
        setMeRole(me?.system_role ?? null);
      } catch {
        setMeUserId(null);
        setMeRole(null);
      }
    })();
  }, []);

  // 編集可否（manager / admin / staff_01~03 のいずれか）
  const canEdit = useMemo(() => {
    const role = (meRole ?? "").toLowerCase();
    const elevated = role === "manager" || role === "admin";

    const mi = (mergedInfo ?? {}) as Record<string, unknown>;
    const s01 = asString(mi["staff_01_user_id"]);
    const s02 = asString(mi["staff_02_user_id"]);
    const s03 = asString(mi["staff_03_user_id"]);
    const mine = String(meUserId ?? "");

    const isStaffMember = !!mine && [s01, s02, s03].filter(Boolean).includes(mine);
    return elevated || isStaffMember;
  }, [meRole, meUserId, mergedInfo]);

  // 既存ロックと合成（完了済みは優先でロック）
  const uiLocked = recordLocked || !canEdit;


  const parseValueText = useCallback((s: unknown): unknown => {
    if (s == null) return "";
    if (typeof s !== "string") return s;
    const t = s.trim();
    if (!t) return "";
    try { return JSON.parse(t); } catch { return s; }
  }, []);

  const loadItems = useCallback(async (recordId_: string) => {
    console.info("[ShiftRecord] loadItems ->", recordId_);
    const r = await fetch(`/api/shift-record-items?record_id=${encodeURIComponent(recordId_)}`, { cache: "no-store" });
    if (!r.ok) { console.warn("[ShiftRecord] items GET !ok", r.status); return; }
    const j = await r.json(); // { items: [...] }
    const next: Record<string, unknown> = {};
    for (const it of (j.items ?? [])) next[it.item_def_id] = parseValueText(it.value_text);
    setValues((prev) => ({ ...next, ...prev }));
  }, [parseValueText]);

  // ====== レコードの確保（既存 or 新規ドラフト） ======
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (recordId) {
          setRid(recordId);
          // ★★ 追加: 既存レコードの status 取得
          const r = await fetch(`/api/shift-records/${recordId}`, { cache: "no-store" });
          if (r.ok) {
            const j = await r.json();
            if (!cancelled) {
              const st = String(j?.status ?? "draft");
              setStatus(st);
              if (st === "完了" || st === STATUS.completed) setRecordLocked(true);
            }
          }
          return;
        }
        const res = await fetch(`/api/shift-records?shift_id=${encodeURIComponent(shiftId)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setRid(data?.id);
          setValues(data?.values ?? {});
          const st = String(data?.status ?? "draft");
          setStatus(st); // ★★ 追加
          if (st === "完了" || st === STATUS.completed) setRecordLocked(true);
        } else {
          const r2 = await fetch(`/api/shift-records`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId, status: STATUS.inProgress }),
          });
          const d2 = await r2.json();
          if (cancelled) return;
          setRid(d2?.id);
          setValues({});
          setRecordLocked(false);
          setStatus("draft"); // ★★ 追加
        }
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [shiftId, recordId]);

  // ===== ユーティリティ: 「確定済み」判定 =====
  // ===== ユーティリティ: 「確定済み」判定（既存運用に合わせて最小修正）=====
  const isFinalStatus = useMemo(() => {
    const s = String(status ?? "").trim();
    // サーバから「完了」で返ってくるケースも吸収
    return s === STATUS.completed || s === "完了"; // STATUS.completed は "submitted"
  }, [status]);

  useEffect(() => {
    if (!rid) return;
    loadItems(rid).catch((e) => { console.error("[ShiftRecord] loadItems error", e); });
  }, [rid, loadItems]);


  // ====== 自動保存（500msデバウンス） ======
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<{ item_def_id: string; value: unknown }[] | null>(null);

  // ===== 自動保存（既存）で draft を明示維持 =====
  const flushQueue = useCallback(async () => {
    if (!rid || !queueRef.current?.length) return;
    const payload = queueRef.current; queueRef.current = null;
    setSaveState("saving");
    try {
      const rows = payload.map(p => ({ record_id: rid, item_def_id: p.item_def_id, value: p.value }));
      const res = await fetch(`/api/shift-record-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error("save failed");

      setStatus("draft"); // ★★ 追加
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e) { console.error(e); setSaveState("error"); }
  }, [rid]);

  // ======== ボタンの見た目・文言を status で出し分け ========
  const actionBtnClass = isFinalStatus
    ? "text-xs px-3 py-1 rounded text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
    : "text-xs px-3 py-1 rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50";

  const actionBtnLabel = isFinalStatus ? "更新" : "保存（最後に必ず保存）"; // ★★ 追加


  const enqueueSave = useCallback((patch: { item_def_id: string; value: unknown }) => {
    queueRef.current = [...(queueRef.current ?? []), patch];
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushQueue, 500);
  }, [flushQueue]);

  const handleChange = useCallback(
    (def: ShiftRecordItemDef, v: unknown) => {
      if (uiLocked) return;                 // ← ここを recordLocked から置換
      setValues((prev) => ({ ...prev, [def.id]: v }));
      enqueueSave({ item_def_id: def.id, value: v });
    },
    [enqueueSave, uiLocked]
  );

  // ===== ルール適用（defs.items -> effectiveItems） =====
  const effectiveItems = useMemo(() => {
    const ctx: Record<string, unknown> = isRecord(mergedInfo) ? { ...mergedInfo } : {};
    if (!isRecord((ctx as Record<string, unknown>).shift)) (ctx as Record<string, unknown>).shift = ctx;
    if (!isRecord((ctx as Record<string, unknown>).shiftInfo)) (ctx as Record<string, unknown>).shiftInfo = ctx; // ← 追加

    return (defs.items ?? [])
      .map((it) => {
        let effActive = it.active;
        let effRequired = it.required;
        let effDefault = it.default_value;

        for (const rule of normalizeRules(it.rules_json)) {
          if (whenSatisfied(rule.when, ctx)) {
            if (typeof rule.set?.active === "boolean") effActive = rule.set.active;
            if (typeof rule.set?.required === "boolean") effRequired = rule.set.required;
            if (Object.prototype.hasOwnProperty.call(rule.set ?? {}, "default_value"))
              effDefault = rule.set?.default_value;
          }
        }

        return { ...it, active: effActive, required: effRequired, default_value: effDefault };
      })
      .filter((it) => it.active !== false); // ← active=false はここで除外（= バリデーション対象外になる）
  }, [defs.items, mergedInfo]);

  // defs.items から code -> item_def_id を作る
  const codeToId = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (defs.items ?? []).forEach((it) => { if (it.code) m[String(it.code)] = it.id; });
    return m;
  }, [defs.items]);

  // id -> rules適用後の default_value（非表示も含めて計算）
  // id -> rules適用後の default_value（非表示も含めて計算）
  const idToDefault = useMemo<Record<string, unknown>>(() => {
    const ctx: Record<string, unknown> = isRecord(mergedInfo) ? { ...mergedInfo } : {};
    if (!isRecord((ctx as Record<string, unknown>).shift)) (ctx as Record<string, unknown>).shift = ctx;
    if (!isRecord((ctx as Record<string, unknown>).shiftInfo)) (ctx as Record<string, unknown>).shiftInfo = ctx;

    const m: Record<string, unknown> = {};
    for (const it of (defs.items ?? [])) {
      // ルールを適用して default_value を決める（active は無視／filter しない）
      let effDefault = it.default_value;
      for (const rule of normalizeRules(it.rules_json)) {
        if (
          whenSatisfied(rule.when, ctx) &&
          Object.prototype.hasOwnProperty.call(rule.set ?? {}, "default_value")
        ) {
          effDefault = rule.set?.default_value;
        }
      }
      if (typeof effDefault !== "undefined") m[it.id] = effDefault;
      else if (typeof it.default !== "undefined") m[it.id] = it.default;
    }
    return m;
  }, [defs.items, mergedInfo]);


  // ===== Validation（必須のみ。active=false と display は対象外） =====
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  void globalErrors;

  const isEmptyValue = useCallback((def: ShiftRecordItemDef, v: unknown) => {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "";
    if (def.input_type === "number") return Number.isNaN(v) || v === "";
    return v === "";
  }, []);

  const runValidation = useCallback(() => {
    const nextErr: Record<string, string> = {};
    const pageMessages: string[] = [];

    // === 既存の「必須項目チェック」(そのまま) ===
    for (const it of effectiveItems) {
      if (it.required && it.input_type !== "display") {
        const cur = Object.prototype.hasOwnProperty.call(values, it.id)
          ? values[it.id]
          : resolveDefaultValue(it, mergedInfo, values, codeToId, idToDefault);
        if (isEmptyValue(it, cur)) nextErr[it.id] = "必須項目です。";
      }
    }

    // === 追加: category-L の rules_json によるバリデーション ===
    // shift情報（service_code等）を取り出せるように評価用コンテキストを用意
    const shiftCtx = (mergedInfo?.shift ?? mergedInfo ?? {}) as Record<string, unknown>;

    for (const l of (defs.L ?? [])) {
      const lRules = (l)?.rules_json?.rules ?? [];


      for (const rule of lRules) {
        // when 判定
        const whenObj = rule?.if ?? {};
        const whenOk = Object.keys(whenObj).every((k) => {
          const v = String(getByPath({ shift: shiftCtx, ...shiftCtx }, k) ?? "");
          const cond = whenObj[k];
          if (cond?.includes_any && Array.isArray(cond.includes_any)) {
            return cond.includes_any.some((needle: string) => v.includes(String(needle)));
          }
          return testStringCond(v, cond);
        });
        if (!whenOk) continue;

        // L配下のSと、そのSに属する item を抽出
        const sInL = (defs.S ?? []).filter((s) => s.l_id === l.id).map((s) => s.id);
        const itemDefsInL = effectiveItems.filter((it) => sInL.includes(it.s_id));

        // ✅ ★ここに skip_if 判定を追加 ★
        const skipCodes: string[] = rule.skip_if?.any_checked_by_code ?? [];
        if (skipCodes.length > 0) {
          // 1) 同じL内で cancel 等がONか？
          const inThisL = itemDefsInL.some((it) => {
            const isTarget = it.code && skipCodes.includes(String(it.code));
            if (!isTarget) return false;
            const val = values[it.id];
            return isTruthyValue(val);
          });

          // 2) 見つからない場合、他Lも含めて全項目で探す（例: 身体の cancel_p で生活ルールを飛ばす）
          const inAnyL = !inThisL && effectiveItems.some((it) => {
            const isTarget = it.code && skipCodes.includes(String(it.code));
            if (!isTarget) return false;
            const val = values[it.id];
            return isTruthyValue(val);
          });

          if (inThisL || inAnyL) continue; // ← この rule 全体をスキップ
        }

        // 除外リストと必要数 …


        // 除外リストと必要数
        const exCodes: string[] = rule?.check?.exclude_items?.by_code ?? [];
        const exNames: string[] = rule?.check?.exclude_items?.by_name_exact ?? [];
        const minNeeded = Math.max(1, Number(rule?.check?.min_checked_in_this_category ?? 1));


        // 実際に「チェックされている」個数を数える
        const checkedCount = itemDefsInL.reduce((acc, it) => {
          const excluded =
            (it.code && exCodes.includes(String(it.code))) ||
            exNames.includes(String(it.label));
          if (excluded) return acc;


          const val = values[it.id];
          const isOn = isTruthyValue(val);
          return acc + (isOn ? 1 : 0);
        }, 0);


        if (checkedCount < minNeeded) {
          const msg = String(rule?.message ?? "カテゴリの必須条件を満たしていません。");
          nextErr[`__rule_l_${l.id}_${String(rule?.id ?? "")}`] = msg;
          pageMessages.push(msg); // ← 画面上部に出すために集約
        }
      }
    }

    setErrors(nextErr);
    setGlobalErrors(Array.from(new Set(pageMessages))); // 重複排除

    return Object.keys(nextErr).length === 0;
  }, [effectiveItems, values, mergedInfo, codeToId, idToDefault, defs.L, defs.S, isEmptyValue]);


  // ===== クリック処理を「保存/更新」両対応に変更 =====
  const handleSubmitOrUpdate = useCallback(async () => {
    if (!rid) return;
    try {
      await flushQueue();
      const ok = runValidation();

      // 最終確定（draft→submitted）
      if (!isFinalStatus) {
        if (!ok) {
          setSaveState("error");
          return; // draft のまま
        }
        setSaveState("saving");

        const res = await fetch(`/api/shift-records/${rid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: STATUS.completed }),
        });
        if (!res.ok) throw new Error("complete failed");

        // 次回シフト用の特記事項サマリは、LW本文とは別に生成する。
        await fetchTokuteiSummarySlice(shiftId).catch((e) => {
          console.error("[tokutei] summary generation error:", e);
        });

        setRecordLocked(true);
        setStatus(STATUS.completed);
        setSaveState("saved");

        // === LW連携（確定時） ===
        try {
          const mergedDefs = [...(defs.items ?? []), ...(effectiveItems ?? [])];
          const categoryNames = Object.fromEntries(defs.S.map((s) => [s.id, s.name]));
          const shouldSend = shouldConnectLW(mergedDefs, values);

          //alert(`[LW DEBUG] trigger=${shouldSend} (mergedDefs=${mergedDefs.length})`);

          if (shouldSend) {
            const channelId = await resolveChannelIdForClient(values, mergedDefs, mergedInfo);

            if (channelId) {
              const visitRecordText = buildVisitRecordMessage(mergedDefs, values, categoryNames);
              const text = `${LW_HEADER}\n${visitRecordText}`;
              await postToLW(channelId, text);
            }
          }
        } catch (e) {
          //alert("[LW] 例外: send-on-xxx error（詳細はConsole）");
          console.error("[LW] send-on-xxx error:", e);
        }

        return;
      }

      // ここから「更新」分岐（final → update）
      if (!ok) {
        setSaveState("saving");
        await fetch(`/api/shift-records/${rid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: STATUS.inProgress }),
        });
        setRecordLocked(false);
        setSaveState("error");
        alert("バリデーションを満たしていないため、ステータスを draft に戻しました。修正の上、保存（完了）してください。");
      } else {
        // OK の場合は status 維持
        setSaveState("saved");
        setRecordLocked(true);

        // === LW連携（更新時） ===
        try {
          const mergedDefs = [...(defs.items ?? []), ...(effectiveItems ?? [])];
          const categoryNames = Object.fromEntries(defs.S.map((s) => [s.id, s.name]));
          const shouldSend = shouldConnectLW(mergedDefs, values);
          //alert(`[LW DEBUG] trigger=${shouldSend} (mergedDefs=${mergedDefs.length})`);

          if (shouldSend) {
            const channelId = await resolveChannelIdForClient(values, mergedDefs, mergedInfo);

            if (channelId) {
              // 更新時も次回シフト用サマリの生成は維持するが、LW本文は入力値を送る。
              await fetchTokuteiSummarySlice(shiftId).catch((e) => {
                console.error("[tokutei] summary generation error:", e);
              });
              const visitRecordText = buildVisitRecordMessage(mergedDefs, values, categoryNames);
              const text = `${LW_HEADER}\n${visitRecordText}`;
              await postToLW(channelId, text);
            }
          }
        } catch (e) {
          //alert("[LW] 例外: send-on-update error（詳細はConsole）");
          console.error("[LW] send-on-update error:", e);
        }
      }
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  }, [rid, isFinalStatus, flushQueue, runValidation, shiftId]);


  // ====== UIレイヤのための整形 ======
  const sByL = useMemo(() => {
    const map: Record<string, ShiftRecordCategoryS[]> = {};
    defs.S.forEach((s) => { (map[s.l_id] ||= []).push(s); });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    return map;
  }, [defs.S]);


  const itemsByS = useMemo(() => {
    const map: Record<string, ShiftRecordItemDef[]> = {};
    effectiveItems.forEach((it) => { (map[it.s_id] ||= []).push(it); });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => byAsc(a.sort_order, b.sort_order) || String(a.code ?? "").localeCompare(String(b.code ?? "")))
    );
    return map;
  }, [effectiveItems]);

  const [activeL, setActiveL] = useState<string | null>(null);
  useEffect(() => { if (!activeL && defs.L.length) setActiveL(defs.L[0].id); }, [defs.L, activeL]);


  type TemplateObj = { template: string };

  function isTemplateObj(v: unknown): v is TemplateObj {
    return typeof v === "object" && v !== null &&
      "template" in (v as Record<string, unknown>) &&
      typeof (v as Record<string, unknown>).template === "string";
  }

  function replaceBraces(s: string, info: Record<string, unknown>): string {
    return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => {
      const path = String(k);
      const val = path.split(".").reduce<unknown>((acc, key) => {
        if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
        return undefined;
      }, info);
      return val == null ? "" : String(val);
    });
  }

  /** 
   * default値を「保存用プレーン文字列」に正規化。
   * - オブジェクト {template:"..."} は中身へ
   * - 文字列 '{"template":"..."}' は JSON.parse して中身へ
   * - 文字列の {{...}} は mergedInfo で置換、未解決が残れば保存しない(null)
   */
  function defaultValueToPlainString(
    dv: unknown,
    info: Record<string, unknown>
  ): string | null {
    if (dv == null) return null;

    // 1) まずオブジェクト { template: "..."}
    if (isTemplateObj(dv)) {
      let base = dv.template.trim();
      if (!base) return null;
      if (base.includes("{{")) base = replaceBraces(base, info);
      if (/\{\{.+\}\}/.test(base)) return null; // 未解決プレースホルダは保存しない
      const out = base.trim();
      return out.length ? out : null;
    }

    // 2) 文字列
    if (typeof dv === "string") {
      let base = dv.trim();
      if (!base) return null;

      // 2-a) 文字列が JSON っぽければパースを試みる
      if (base.startsWith("{") && base.endsWith("}")) {
        try {
          const obj = JSON.parse(base) as unknown;
          if (isTemplateObj(obj)) {
            base = obj.template.trim();
          }
        } catch {
          // パース失敗はそのまま base を使う
        }
      }

      // 2-b) {{...}} 置換
      if (base.includes("{{")) base = replaceBraces(base, info);
      if (/\{\{.+\}\}/.test(base)) return null; // 未解決は保存しない

      const out = base.trim();
      return out.length ? out : null;
    }

    // 3) number / boolean はそのまま文字列化
    if (typeof dv === "number" || typeof dv === "boolean") return String(dv);

    // 4) 配列は要件に合わせて。今回は保存しない（必要なら join(",") などに変更）
    if (Array.isArray(dv)) return null;

    // 5) その他のオブジェクトは保存しない
    return null;
  }


  // ===== 初期デフォルトの自動保存（一度だけ） =====
  useEffect(() => {
    if (!rid) return;
    // すでにこの rid で実行済みならスキップ
    if (seededDefaultsRef.current?.rid === rid) return;

    // 定義やルールがまだ揃っていない間はスキップ
    if (!defs.items?.length) return;

    // 保存対象を収集
    const rows: { record_id: string; item_def_id: string; value: unknown }[] = [];
    const sanitizedRows = rows.flatMap((r) => {
      // ここで JSON 文字列 / {template:...} / {{...}} 未解決 などを全部吸収
      const s = defaultValueToPlainString(r.value, mergedInfo);
      return s == null ? [] : [{ ...r, value: s }]; // 文字列だけを送る。nullなら送らない
    });
    const nextValues: Record<string, unknown> = {};

    for (const it of effectiveItems) {
      if (it.input_type === "display") continue;

      const has = Object.prototype.hasOwnProperty.call(values, it.id);
      const cur = has ? values[it.id] : undefined;
      if (has && !isEmptyValue(it, cur)) continue;

      const dv = resolveDefaultValue(it, mergedInfo, values, codeToId, idToDefault);

      // ★ ここで正規化（JSON文字列も含めて吸収）
      const saveStr = defaultValueToPlainString(dv, mergedInfo);
      if (saveStr == null) continue;

      // 既存の契約どおり value キーで送る（value_text にしない）
      rows.push({ record_id: rid, item_def_id: it.id, value: saveStr });
      nextValues[it.id] = saveStr;

      // ★ 画面 state もプレーン文字列で埋める
      nextValues[it.id] = saveStr;
    }

    if (rows.length === 0) {
      // 実施済みマークだけ付けて終了
      seededDefaultsRef.current = { rid };
      return;
    }

    (async () => {
      try {
        setSaveState("saving");
        // 以降は sanitizedRows を送る
        const res = await fetch(`/api/shift-record-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sanitizedRows),
        });
        if (!res.ok) throw new Error("initial default save failed");
        // 画面側の state も default ぶんだけ埋めておく
        setValues((prev) => ({ ...nextValues, ...prev }));
        setSaveState("saved");
      } catch (e) {
        console.error("[ShiftRecord] seed default save error", e);
        setSaveState("error");
      } finally {
        // 二重実行防止
        seededDefaultsRef.current = { rid };
        // 表示のための軽いリセット
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
      }
    })();
    // 依存関係：
  }, [rid, defs.items, effectiveItems, values, mergedInfo, codeToId, idToDefault, isEmptyValue]);


  // ====== レンダラ ======
  return (
    <div className="flex flex-col gap-3">
      {/* ヘッダ */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          Shift ID: {shiftId}
          <span className="ml-3 text-xs text-gray-500">
            <span className="text-red-500">*</span>…必須&nbsp;
            <span className="text-green-600">*</span>…LW連携
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* ← 追加: ルール違反メッセージ（先頭だけを見やすく） */}
          {globalErrors.length > 0 && (
            <div className="text-xs text-red-600 max-w-[40ch] line-clamp-2" title={globalErrors.join(" / ")}>
              {globalErrors[0]}
            </div>
          )}
          <SaveIndicator state={saveState} done={recordLocked} />
          <button
            type="button"
            className={actionBtnClass}
            onClick={handleSubmitOrUpdate}
            disabled={!rid}
            aria-disabled={!rid}
            title={isFinalStatus ? "内容を更新します" : "保存して完了にする"}
          >
            {actionBtnLabel}
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* 本体 */}
      {/* --- スマホ: 上部固定の横並びLナビ --- */}
      <div className="sm:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed"><tbody><tr>
            {defs.L.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => (
              <td key={l.id} className="align-middle">
                <button
                  className={["px-3 py-2 text-sm whitespace-nowrap", activeL === l.id ? "font-semibold border-b-2 border-blue-500" : "text-gray-600"].join(" ")}
                  onClick={() => setActiveL(l.id)}
                >{l.name}</button>
              </td>
            ))}
          </tr></tbody></table>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* PC: 左固定のLナビ */}
        <aside className="hidden sm:block sm:col-span-3">
          <div className="border rounded-xl overflow-hidden sticky top-0">
            {loadingDefs && <div className="p-3 text-sm text-gray-500">定義を読み込み中…</div>}
            {defsError && <div className="p-3 text-sm text-red-600">{defsError}</div>}
            {!loadingDefs && !defsError && (
              <ul className="divide-y">
                {defs.L.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => (
                  <li key={l.id}>
                    <button
                      className={`w-full text左 px-3 py-2 text-sm ${activeL === l.id ? "bg-gray-100 font-semibold" : "hover:bg-gray-50"}`}
                      onClick={() => setActiveL(l.id)}
                    >{l.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Sカテゴリ + 項目（右） */}
        <main className="col-span-12 sm:col-span-9">
          {activeL ? (
            <div className="space-y-4">
              {(sByL[activeL] ?? []).map((s) => (
                <section key={s.id} className="border rounded-xl">
                  <header className="px-3 py-2 bg-gray-50 border-b rounded-t-xl font-medium text-sm">{s.name}</header>
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(itemsByS[s.id] ?? []).map((def) => (
                      <FieldRow
                        key={`${def.s_id}-${def.id}`}
                        def={def}
                        value={values[def.id]}
                        onChange={handleChange}
                        shiftInfo={mergedInfo}
                        allValues={values}
                        codeToId={codeToId}
                        idToDefault={idToDefault}
                        locked={uiLocked}
                        error={errors[def.id]}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">左のカテゴリを選択してください。</div>
          )}
        </main>
      </div>
      {/* フッター操作バー（ページ下部にも同じ操作を配置） */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* ← 追加: ルール違反メッセージ（先頭だけを見やすく） */}
          {globalErrors.length > 0 && (
            <div className="text-xs text-red-600 max-w-[40ch] line-clamp-2" title={globalErrors.join(" / ")}>
              {globalErrors[0]}
            </div>
          )}
          <SaveIndicator state={saveState} done={recordLocked} />
          <button
            type="button"
            className={actionBtnClass}
            onClick={handleSubmitOrUpdate}
            disabled={!rid}
            aria-disabled={!rid}
            title={isFinalStatus ? "内容を更新します" : "保存して完了にする"}
          >
            {actionBtnLabel}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== サブコンポーネント =====================
function SaveIndicator({ state, done }: { state: SaveState; done?: boolean }) {
  const text = done
    ? "完了"
    : state === "saving" ? "保存中…" : state === "saved" ? "保存しました" : state === "error" ? "保存に失敗しました" : "";
  const color = done ? "text-blue-600" : state === "error" ? "text-red-600" : state === "saved" ? "text-green-600" : "text-gray-500";
  return <div className={`text-xs ${color}`}>{text}</div>;
}

function FieldRow({ def, value, onChange, shiftInfo, allValues, codeToId, idToDefault, locked, error }: {
  def: ShiftRecordItemDef;
  value: unknown;
  onChange: (def: ShiftRecordItemDef, v: unknown) => void;
  shiftInfo: Record<string, unknown> | null;
  allValues: Record<string, unknown>;
  codeToId: Record<string, string>;
  idToDefault: Record<string, unknown>;
  locked: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1 opacity-100" style={locked ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
      <label className="text-xs font-medium text-gray-700">
        {def.label}
        {def.required && <span className="ml-1 text-red-500">*</span>}
        {isLwConnectDef(def) && <span className="ml-1 text-green-600">*</span>}
      </label>
      <ItemInput def={def} value={value} onChange={onChange} shiftInfo={shiftInfo} allValues={allValues} codeToId={codeToId} idToDefault={idToDefault} />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {def.description && <p className="text-[11px] text-gray-500">{def.description}</p>}
    </div>
  );
}

function ItemInput({ def, value, onChange, shiftInfo, allValues, codeToId, idToDefault }: {
  def: ShiftRecordItemDef;
  value: unknown;
  onChange: (def: ShiftRecordItemDef, v: unknown) => void;
  shiftInfo: Record<string, unknown> | null;
  allValues: Record<string, unknown>;
  codeToId: Record<string, string>;
  idToDefault: Record<string, unknown>;
}) {
  const hasValue = Object.prototype.hasOwnProperty.call(allValues, def.id);

  const t = def.input_type;

  // display（読み取り専用テキスト）
  if (t === "display") {
    let text = def.display_text ?? (typeof value === "string" ? value : "");

    const raw = def.options ?? def.options_json;
    const opt = (Array.isArray(raw) || typeof raw === "object")
      ? (raw as Record<string, unknown>)
      : (() => { try { return JSON.parse(String(raw)); } catch { return {}; } })();

    if (typeof opt.template === "string" && shiftInfo) {
      text = renderTemplate(opt.template, shiftInfo);
    } else if (Array.isArray(opt.ref) && shiftInfo) {
      // 既存: 配列キー連結
      const parts = opt.ref
        .filter((k): k is string => typeof k === "string")
        .map((k) => shiftInfo[k])
        .map((v) => (v == null ? "" : String(v)))
        .filter(Boolean);
      if (parts.length) text = parts.join(" ");
    } else if (typeof opt.ref === "string" && shiftInfo) {
      const path = opt.ref.replace(/^shiftInfo\./, "").replace(/^shift\./, "");
      const v = getByPath(shiftInfo as Record<string, unknown>, path);
      if (v != null && v !== "") text = String(v);
    }

    // default_value が "me.X" または { me: "X" } のとき、同レコードの値で埋める
    if (!text || text === "—") {
      const dv = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
      text = dv == null ? "" : String(dv);
    }

    const unit = def.unit ? String(def.unit) : "";
    const out = text ? (unit ? `${text}${unit}` : text) : "—";

    // ★ 追加: リンク描画モード（オプションで as: "link" または link: true を指定）
    const asLink = opt && (opt.as === "link" || opt.link === true);
    const href = String(text ?? "").trim();
    if (asLink && /^https?:\/\//.test(href)) {
      const label = typeof opt.label === "string" && opt.label.trim() ? opt.label.trim() : href;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline break-all"
          title={href}
        >
          {label}
        </a>
      );
    }

    return <div className="text-sm whitespace-pre-wrap break-words">{out}</div>;
  }

  // checkbox（排他 or 複数 or 2択）
  if (t === "checkbox") {
    const raw = def.options ?? def.options_json;

    const { items: opts, exclusive, multiple } = parseCheckboxOptions(raw, def.exclusive);

    // A) 排他 = ラジオ（N択）
    if (exclusive && opts.length >= 2) {
      const defVal = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
      const rawV = value as unknown;
      const cur = String((rawV === "" || rawV == null) ? (defVal ?? "") : rawV);
      const name = `ex-${def.s_id}-${def.id}`;
      const select = (val: string) => onChange(def, val);
      return (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={def.label}>
          {opts.map((o) => {
            const v = String(o.value); const id = `${name}-${v}`;
            return (
              <label key={v} htmlFor={id} className="inline-flex items-center gap-2">
                <input id={id} type="radio" name={name} value={v} checked={cur === v} onChange={() => select(v)} />
                <span className="text-sm">{o.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    // B) 複数チェック：multiple=true または 3件以上
    if (multiple || opts.length >= 3) {
      let curArr = toStringArray(value);
      if (curArr.length === 0) {
        const defVal = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
        if (Array.isArray(defVal)) curArr = defVal.map(String);
        else if (typeof defVal === "string" && defVal.trim() !== "") curArr = toStringArray(defVal);
        else if (typeof defVal === "number") curArr = [String(defVal)];
      }
      const toggle = (val: string) => {
        const set = new Set(curArr.map(String));
        if (set.has(val)) set.delete(val); else set.add(val);
        onChange(def, Array.from(set));
      };
      return (
        <div className="flex flex-wrap gap-4" role="group" aria-label={def.label}>
          {opts.map(o => {
            const v = String(o.value); const checked = curArr.includes(v);
            return (
              <label key={v} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
                <span className="text-sm">{o.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    // C) 2択 = ラジオ（未選択許容・既定値反映）
    if (opts.length >= 2) {
      const optYes = { label: String(opts[0].label), value: String(opts[0].value) };
      let optNo = { label: String(opts[1].label), value: String(opts[1].value) };
      if (optYes.value === optNo.value) {
        optNo = { ...optNo, value: optYes.value === "0" ? "1" : optYes.value === "1" ? "0" : `${optNo.value}_no` };
      }
      const defVal = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
      const rawVal = value as unknown;
      const cur = String((rawVal === "" || rawVal == null) ? (defVal ?? "") : rawVal);
      const groupName = `bin-${def.s_id}-${def.id}`;
      const select = (val: string) => onChange(def, val);
      return (
        <div className="flex items-center gap-6" role="radiogroup" aria-label={def.label}>
          <label htmlFor={`${groupName}-yes`} className="inline-flex items-center gap-2">
            <input id={`${groupName}-yes`} type="radio" name={groupName} value={optYes.value} checked={cur === String(optYes.value)} onChange={() => select(optYes.value)} />
            <span className="text-sm">{optYes.label}</span>
          </label>
          <label htmlFor={`${groupName}-no`} className="inline-flex items-center gap-2">
            <input id={`${groupName}-no`} type="radio" name={groupName} value={optNo.value} checked={cur === String(optNo.value)} onChange={() => select(optNo.value)} />
            <span className="text-sm">{optNo.label}</span>
          </label>
        </div>
      );
    }

    // D) options 無し：単体チェック（"1" / ""）
    {
      const defVal = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
      const rawCur = hasValue ? value : defVal;
      const cur = String(rawCur ?? "");
      return (
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={cur === "1"} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(def, e.target.checked ? "1" : "")} />
          <span className="text-sm">はい / 実施</span>
        </label>
      );
    }
  }

  if (t === "select") {
    const raw = def.options ?? def.options_json;
    const { items: selectItems, placeholder } = parseSelectOptions(raw); // ← opts という変数名の重複を避ける
    const defVal = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
    const rawVal = value as unknown;
    const cur = String(hasValue ? (rawVal ?? "") : (defVal ?? ""));

    return (
      <select
        className="border rounded px-2 py-1 text-sm"
        value={cur}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(def, e.target.value)}
      >
        <option value="">{`— ${placeholder || "選択してください"} —`}</option>
        {selectItems.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    );
  }

  // number
  if (t === "number") {
    const unit = def.unit ? String(def.unit) : "";
    const baseDef = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
    const rawVal = value as unknown;
    const cur = String(hasValue ? (rawVal ?? "") : (baseDef ?? ""));

    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm"
          value={cur}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(def, e.target.value === "" ? "" : Number(e.target.value))}
        />
        {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </div>
    );
  }

  // textarea
  if (t === "textarea") {
    const baseDef = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
    const rawVal = value as unknown;
    const cur = String((rawVal === "" || rawVal == null) ? (baseDef ?? "") : rawVal);
    return (
      <textarea className="border rounded px-2 py-1 text-sm min-h-[84px]" value={cur} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(def, e.target.value)} />
    );
  }

  // text（デフォルト）
  const unit = def.unit ? String(def.unit) : "";
  const baseDef = resolveDefaultValue(def, shiftInfo, allValues, codeToId, idToDefault);
  const rawVal = value as unknown;
  let finalDefaultValue = baseDef ?? "";

  // URLパラメータから渡された値を、フォームの 'code' に基づいて優先的に適用する
  if (shiftInfo) {
    if (def.code === "route" && shiftInfo.standard_route) {
      finalDefaultValue = String(shiftInfo.standard_route);
    } else if (def.code === "trans_ways" && shiftInfo.standard_trans_ways) {
      finalDefaultValue = String(shiftInfo.standard_trans_ways);
    } else if (def.code === "purpose" && shiftInfo.standard_purpose) {
      finalDefaultValue = String(shiftInfo.standard_purpose);
    }
  }

  // --- ↑↑↑ 追記ロジックの終わり ↑↑↑ ---

  // rawValが未設定（""またはnull/undefined）の場合にのみ、最終的なデフォルト値をStringにして適用する
  // finalDefaultValueがオブジェクト（{"template":""}）の場合でも、String()で空文字になることを期待する。
  const cur = hasValue
    ? String(rawVal ?? "")     // ← ユーザー入力（空文字も尊重）
    : String(finalDefaultValue ?? ""); // ← 初期表示だけdefault

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        className="border rounded px-2 py-1 text-sm flex-1"
        value={cur} // curは必ず文字列である
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(def, e.target.value)}
      />
      {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
    </div>
  );
}
