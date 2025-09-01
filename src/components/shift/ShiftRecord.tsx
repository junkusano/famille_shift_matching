// components/shift/ShiftRecord.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ===== 型（APIの実体に寄せて最低限の想定。柔らかくしておく） =====
export type ShiftRecordCategoryL = { id: string; code?: string; name: string; sort_order?: number };
export type ShiftRecordCategoryS = { id: string; l_id: string; code?: string; name: string; sort_order?: number };
export type ShiftRecordItemDef = {
    id: string;
    s_id: string; // 紐づくSカテゴリ
    code?: string;
    label: string;
    description?: string;
    input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display";
    required?: boolean;
    // select用
    options_json?: unknown; // string[] | {label:string,value:string}[] などを想定（API側の実体に依存）
    // number用
    min?: number; max?: number; step?: number;
    // display用
    display_text?: string;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

export default function ShiftRecord({
    shiftId,
    recordId,
    onSavedStatusChange,
}: {
    shiftId: string;
    recordId?: string;
    onSavedStatusChange?: (s: SaveState) => void;
}) {
    // ====== 定義ロード ======
    const [defs, setDefs] = useState<{ L: ShiftRecordCategoryL[]; S: ShiftRecordCategoryS[]; items: ShiftRecordItemDef[] }>({
        L: [],
        S: [],
        items: [],
    });
    const [loadingDefs, setLoadingDefs] = useState(true);
    const [defsError, setDefsError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoadingDefs(true);
                const [l, s, d] = await Promise.all([
                    fetch("/api/shift-record-def/category-l").then((r) => r.json()),
                    fetch("/api/shift-record-def/category-s").then((r) => r.json()),
                    fetch("/api/shift-record-def/item-defs").then((r) => r.json()),
                ]);
                if (!cancelled) setDefs({ L: l ?? [], S: s ?? [], items: d ?? [] });
            } catch {
                if (!cancelled) setDefsError("定義の取得に失敗しました");
            } finally {
                if (!cancelled) setLoadingDefs(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // ====== レコードの確保（既存 or 新規ドラフト） ======
    const [rid, setRid] = useState<string | undefined>(recordId);
    const [values, setValues] = useState<Record<string, unknown>>({}); // key = item_def_id
    const [saveState, setSaveState] = useState<SaveState>("idle");

    useEffect(() => {
        onSavedStatusChange?.(saveState);
    }, [saveState, onSavedStatusChange]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (recordId) {
                    setRid(recordId);
                    return;
                }
                const res = await fetch(`/api/shift-records?shift_id=${encodeURIComponent(shiftId)}`);
                if (res.ok) {
                    const data = await res.json(); // { id, status, values }
                    if (cancelled) return;
                    setRid(data?.id);
                    setValues(data?.values ?? {});
                } else {
                    const r2 = await fetch(`/api/shift-records`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ shift_id: shiftId, status: "draft" }),
                    });
                    const d2 = await r2.json();
                    if (cancelled) return;
                    setRid(d2?.id);
                    setValues({});
                }
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [shiftId, recordId]);

    // ====== 自動保存（500msデバウンス） ======
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const queueRef = useRef<{ item_def_id: string; value: unknown }[] | null>(null);

    const flushQueue = useCallback(async () => {
        if (!rid || !queueRef.current?.length) return;
        const payload = queueRef.current;
        queueRef.current = null;
        setSaveState("saving");
        try {
            const res = await fetch(`/api/shift-records/${rid}/values`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("save failed");
            setSaveState("saved");
            // 軽いフィードバックの維持 → 1.2秒後にidleへ戻す（任意）
            setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
        } catch (e) {
            console.error(e);
            setSaveState("error");
        }
    }, [rid]);

    const enqueueSave = useCallback((patch: { item_def_id: string; value: unknown }) => {
        // キューにまとめて一括保存（500ms）
        queueRef.current = [...(queueRef.current ?? []), patch];
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(flushQueue, 500);
    }, [flushQueue]);

    const handleChange = useCallback(
        (def: ShiftRecordItemDef, v: unknown) => {
            setValues((prev) => ({ ...prev, [def.id]: v }));
            enqueueSave({ item_def_id: def.id, value: v });
        },
        [enqueueSave]
    );

    // ====== UIレイヤのための整形 ======
    const sByL = useMemo(() => {
        const map: Record<string, ShiftRecordCategoryS[]> = {};
        defs.S.forEach((s) => {
            (map[s.l_id] ||= []).push(s);
        });
        Object.values(map).forEach((arr) => arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
        return map;
    }, [defs.S]);

    const itemsByS = useMemo(() => {
        const map: Record<string, ShiftRecordItemDef[]> = {};
        defs.items.forEach((it) => {
            (map[it.s_id] ||= []).push(it);
        });
        Object.values(map).forEach((arr) => arr.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")));
        return map;
    }, [defs.items]);

    const [activeL, setActiveL] = useState<string | null>(null);
    useEffect(() => {
        if (!activeL && defs.L.length) setActiveL(defs.L[0].id);
    }, [defs.L, activeL]);

    // ====== レンダラ ======
    return (
        <div className="flex flex-col gap-3">
            {/* ヘッダ */}
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-gray-600">Shift ID: {shiftId}</div>
                <SaveIndicator state={saveState} />
            </div>

            {/* 本体 */}
            {/* --- スマホ: 上部固定の横並びLナビ --- */}
            <div className="sm:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                        <tbody>
                            <tr>
                                {defs.L.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => (
                                    <td key={l.id} className="align-middle">
                                        <button
                                            className={[
                                                "px-3 py-2 text-sm whitespace-nowrap",
                                                activeL === l.id ? "font-semibold border-b-2 border-blue-500" : "text-gray-600"
                                            ].join(" ")}
                                            onClick={() => setActiveL(l.id)}
                                        >
                                            {l.name}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="grid grid-cols-12 gap-3">
                {/* PC: 左固定のLナビ（従来） */}
                <aside className="hidden sm:block sm:col-span-3">
                    <div className="border rounded-xl overflow-hidden sticky top-0">
                        {loadingDefs && <div className="p-3 text-sm text-gray-500">定義を読み込み中…</div>}
                        {defsError && <div className="p-3 text-sm text-red-600">{defsError}</div>}
                        {!loadingDefs && !defsError && (
                            <ul className="divide-y">
                                {defs.L.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => (
                                    <li key={l.id}>
                                        <button
                                            className={`w-full text-left px-3 py-2 text-sm ${activeL === l.id ? "bg-gray-100 font-semibold" : "hover:bg-gray-50"}`}
                                            onClick={() => setActiveL(l.id)}
                                        >
                                            {l.name}
                                        </button>
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
                                    <header className="px-3 py-2 bg-gray-50 border-b rounded-t-xl font-medium text-sm">
                                        {s.name}
                                    </header>
                                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {(itemsByS[s.id] ?? []).map((def) => (
                                            <FieldRow
                                                key={def.id}
                                                def={def}
                                                value={values[def.id]}
                                                onChange={handleChange}
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
        </div>
    );
}

// ===================== サブコンポーネント =====================
function SaveIndicator({ state }: { state: SaveState }) {
    const text =
        state === "saving" ? "保存中…" : state === "saved" ? "保存しました" : state === "error" ? "保存に失敗しました" : "";
    const color = state === "error" ? "text-red-600" : state === "saved" ? "text-green-600" : "text-gray-500";
    return <div className={`text-xs ${color}`}>{text}</div>;
}

function FieldRow({
    def,
    value,
    onChange,
}: {
    def: ShiftRecordItemDef;
    value: unknown;
    onChange: (def: ShiftRecordItemDef, v: unknown) => void;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
                {def.label}
                {def.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            <ItemInput def={def} value={value} onChange={onChange} />
            {def.description && <p className="text-[11px] text-gray-500">{def.description}</p>}
        </div>
    );
}

function ItemInput({
    def,
    value,
    onChange,
}: {
    def: ShiftRecordItemDef;
    value: unknown;
    onChange: (def: ShiftRecordItemDef, v: unknown) => void;
}) {
    const t = def.input_type;
    const vStr = (value ?? "") as string;
    const vBool = Boolean(value);
    void vBool;

    if (t === "display") {
        return (
            <div className="px-2 py-1 text-sm bg-gray-50 border rounded">
                {String(def.display_text ?? vStr ?? "—")}
            </div>
        );
    }

    if (t === "checkbox") {
        // CSVから来る options_json が「文字列」でも確実に配列へ
        const opts = parseOptionsFlexible(def.options_json);

        if (opts.length >= 2) {
            const [optYes, optNo] = opts;
            const cur =
                typeof value === "boolean"
                    ? (value ? String(optYes.value) : String(optNo.value))
                    : String(value ?? "");

            const isYes = cur === String(optYes.value);
            const isNo = cur === String(optNo.value);

            const select = (val: string) => onChange(def, val);
            const clear = () => onChange(def, "");

            return (
                <div className="flex items-center gap-6">
                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isYes}
                            onChange={() => (isYes ? clear() : select(String(optYes.value)))}
                        />
                        <span className="text-sm">{optYes.label}</span>
                    </label>

                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isNo}
                            onChange={() => (isNo ? clear() : select(String(optNo.value)))}
                        />
                        <span className="text-sm">{optNo.label}</span>
                    </label>
                </div>
            );
        }

        // フォールバック：options が取れない時のみ
        return (
            <label className="inline-flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => onChange(def, e.target.checked)}
                />
                <span className="text-sm">はい / 実施</span>
            </label>
        );
    }

    if (t === "select") {
        const optsRaw = Array.isArray(def.options_json) ? def.options_json : tryParseJSON(def.options_json);
        const opts: { label: string; value: string }[] = normalizeOptions(optsRaw);
        return (
            <select
                className="border rounded px-2 py-1 text-sm"
                value={vStr ?? ""}
                onChange={(e) => onChange(def, e.target.value)}
            >
                <option value="">— 選択してください —</option>
                {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        );
    }

    if (t === "number") {
        return (
            <input
                type="number"
                className="border rounded px-2 py-1 text-sm"
                value={String(vStr ?? "")}
                min={def.min}
                max={def.max}
                step={def.step}
                onChange={(e) => onChange(def, e.target.value === "" ? "" : Number(e.target.value))}
            />
        );
    }

    if (t === "textarea") {
        return (
            <textarea
                className="border rounded px-2 py-1 text-sm min-h-[84px]"
                value={vStr}
                onChange={(e) => onChange(def, e.target.value)}
            />
        );
    }

    if (t === "image") {
        // 将来：ドキュメントアップローダと接続。ここではURL直入力/ドラッグ&ドロップの土台だけ。
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <input
                        type="url"
                        className="border rounded px-2 py-1 text-sm flex-1"
                        placeholder="画像URL（将来はアップローダ連携）"
                        value={vStr}
                        onChange={(e) => onChange(def, e.target.value)}
                    />
                </div>
                {vStr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vStr} alt="preview" className="max-h-40 rounded border" />
                ) : (
                    <div className="text-[11px] text-gray-500">画像URLを入力するとプレビューします。</div>
                )}
            </div>
        );
    }

    // デフォルトは text
    return (
        <input
            type="text"
            className="border rounded px-2 py-1 text-sm"
            value={vStr}
            onChange={(e) => onChange(def, e.target.value)}
        />
    );
}

// ===== util =====
function tryParseJSON(v: unknown): unknown {
    if (v == null) return [];
    if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return []; }
    }
    return v;
}

function normalizeOptions(raw: unknown): { label: string; value: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { label: string; value: string }[] = [];
    for (const el of raw) {
        if (typeof el === "string") out.push({ label: el, value: el });
        else if (el && typeof el === "object") {
            const r = el as Record<string, unknown>;
            const label = String(r.label ?? r.name ?? r.value ?? "");
            const value = String(r.value ?? r.code ?? r.label ?? "");
            if (value) out.push({ label, value });
        }
    }
    return out;
}

function parseOptionsFlexible(v: unknown): { label: string; value: string }[] {
  // 1) まずは通常の JSON.parse を試す（既存）
  const parsed = Array.isArray(v) ? v : tryParseJSON(v);
  let opts = normalizeOptions(parsed);
  if (opts.length > 0) return opts;

  // 2) 文字列の“ゆるい”書式を救済
  if (typeof v === "string") {
    const s = loosenJSONString(v);
    // 配列でなければ配列に包む/区切りを補う
    const asArray = coerceToArrayJSON(s);
    const parsed2 = tryParseJSON(asArray);
    opts = normalizeOptions(parsed2);
    if (opts.length > 0) return opts;

    // 3) さらに簡易: 「有,無」や「有／無」をカンマ分割
    const simple = s.replace(/[／|｜]/g, ",");
    if (!simple.includes("{")) {
      const parts = simple.split(/[,\s、]+/).filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(0, 2).map((p, i) => ({ label: p, value: String(i) }));
      }
    }
    // 4) 「有:0,無:1」形式
    const kv = simple.split(/[,\s、]+/).map((t) => t.split(":"));
    if (kv.every((x) => x.length === 2)) {
      return kv.map(([k, v]) => ({ label: k, value: String(v) }));
    }
  }
  return [];
}

function loosenJSONString(input: string): string {
  // 全角クォート→半角、全角カンマ→半角、末尾/先頭の余分を除去
  return input
    .replace(/[“”＂]/g, '"')
    .replace(/[‘’＇]/g, "'")
    .replace(/，/g, ",")
    .trim();
}

function coerceToArrayJSON(s: string): string {
  const t = s.trim();
  // 既に配列ならそのまま
  if (t.startsWith("[") && t.endsWith("]")) return t;

  // 連続するオブジェクト {..}{..} → {..},{..} に補正して配列化
  if (t.startsWith("{") && t.endsWith("}")) {
    const withCommas = t.replace(/}\s*{/g, "},{");
    return `[${withCommas}]`;
  }

  // 素の「有,無」などはこの後の簡易分割に回す
  return t;
}
