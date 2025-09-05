"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";  // ←追加


// 並び順ユーティリティ
const byAsc = (x?: number, y?: number) => Number(x ?? 0) - Number(y ?? 0);

// ===== 型（APIの実体に寄せて最低限の想定。柔らかくしておく） =====
export type ShiftRecordCategoryL = { id: string; code?: string; name: string; sort_order?: number };
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
    sort_order?: number;  // 並び順
    // select/checkbox 用
    options?: unknown;
    options_json?: unknown;
    // number用
    min?: number; max?: number; step?: number;
    // display用
    display_text?: string;
    // 共通
    unit?: string;             // 単位（末尾に表示）
    default_value?: unknown;   // 既定値
    default?: unknown;         // 既定値（どちらのキーでも受ける）
    exclusive?: boolean;       // 3件以上のcheckboxを排他（ラジオ）にしたい時
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
    const sp = useSearchParams();
    const clientNameFromQS = sp.get("client_name") || undefined;
    const shiftInfo = useShiftInfo(shiftId);

    // ShiftRecord.tsx
    // 既存：clientNameFromQS / shiftInfo はそのまま利用
    const mergedInfo = useMemo(() => {
        // まず API の値をベースに
        const base = { ...(shiftInfo ?? {}) } as Record<string, unknown>;

        // QS の client_name が空でなければ、API側が未設定 or 空のときだけ上書き
        const qs = (clientNameFromQS ?? "").trim();
        const api = typeof base.client_name === "string" ? String(base.client_name).trim() : "";
        if (qs && !api) base.client_name = qs;

        return base;
    }, [shiftInfo, clientNameFromQS]);

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
        return () => { cancelled = true; };
    }, []);

    // ====== レコードの確保（既存 or 新規ドラフト） ======
    const [rid, setRid] = useState<string | undefined>(recordId);
    const [values, setValues] = useState<Record<string, unknown>>({}); // key = item_def_id
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [recordLocked, setRecordLocked] = useState<boolean>(false); // 完了後にロック

    useEffect(() => { onSavedStatusChange?.(saveState); }, [saveState, onSavedStatusChange]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (recordId) { setRid(recordId); return; }
                // 新API: /shift_records で既存レコード検索
                const res = await fetch(`/shift_records?shift_id=${encodeURIComponent(shiftId)}`);
                if (res.ok) {
                    const data = await res.json(); // 期待: { id, status, values }
                    if (cancelled) return;
                    setRid(data?.id);
                    setValues(data?.values ?? {});
                    if (data?.status === "完了") setRecordLocked(true);
                } else {
                    // 見つからなければ新規作成（status: 入力中）
                    const r2 = await fetch(`/shift_records`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ shift_id: shiftId, status: "入力中" }),
                    });
                    const d2 = await r2.json();
                    if (cancelled) return;
                    setRid(d2?.id);
                    setValues({});
                    setRecordLocked(false);
                }
            } catch (e) { console.error(e); }
        })();
        return () => { cancelled = true; };
    }, [shiftId, recordId]);

    // ====== 自動保存（500msデバウンス） ======
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const queueRef = useRef<{ item_def_id: string; value: unknown }[] | null>(null);

    const flushQueue = useCallback(async () => {
        if (!rid || !queueRef.current?.length) return;
        const payload = queueRef.current; queueRef.current = null;
        setSaveState("saving");
        try {
            // 新API: /shift_record_items へ一括登録（追記/アップサート前提）
            const rows = payload.map(p => ({ record_id: rid, item_def_id: p.item_def_id, value: p.value }));
            const res = await fetch(`/shift_record_items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(rows),
            });
            if (!res.ok) throw new Error("save failed");
            // レコード本体も都度 更新日時 + ステータスを「入力中」に維持
            await fetch(`/shift_records/${rid}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "入力中" }),
            });
            setSaveState("saved");
            setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
        } catch (e) { console.error(e); setSaveState("error"); }
    }, [rid]);

    const enqueueSave = useCallback((patch: { item_def_id: string; value: unknown }) => {
        queueRef.current = [...(queueRef.current ?? []), patch];
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(flushQueue, 500);
    }, [flushQueue]);

    const handleChange = useCallback(
        (def: ShiftRecordItemDef, v: unknown) => {
            if (recordLocked) return; // 完了後は編集不可
            setValues((prev) => ({ ...prev, [def.id]: v }));
            enqueueSave({ item_def_id: def.id, value: v });
        },
        [enqueueSave, recordLocked]
    );

    // ====== UIレイヤのための整形 ======
    const sByL = useMemo(() => {
        const map: Record<string, ShiftRecordCategoryS[]> = {};
        defs.S.forEach((s) => { (map[s.l_id] ||= []).push(s); });
        Object.values(map).forEach((arr) => arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
        return map;
    }, [defs.S]);

    const itemsByS = useMemo(() => {
        const map: Record<string, ShiftRecordItemDef[]> = {};
        defs.items.forEach((it) => { (map[it.s_id] ||= []).push(it); });
        Object.values(map).forEach((arr) =>
            arr.sort((a, b) => byAsc(a.sort_order, b.sort_order) || String(a.code ?? "").localeCompare(String(b.code ?? "")))
        );
        return map;
    }, [defs.items]);

    const [activeL, setActiveL] = useState<string | null>(null);
    useEffect(() => { if (!activeL && defs.L.length) setActiveL(defs.L[0].id); }, [defs.L, activeL]);

    // 完了ボタン（保存 → ステータス完了）
    const handleComplete = useCallback(async () => {
        if (!rid || recordLocked) return;
        try {
            // 残キューがあれば先にフラッシュ
            await flushQueue();
            setSaveState("saving");
            const res = await fetch(`/shift_records/${rid}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "完了" }),
            });
            if (!res.ok) throw new Error("complete failed");
            setRecordLocked(true);
            setSaveState("saved");
        } catch (e) {
            console.error(e);
            setSaveState("error");
        }
    }, [rid, recordLocked, flushQueue]);

    // ====== レンダラ ======
    return (
        <div className="flex flex-col gap-3">
            {/* ヘッダ */}
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-gray-600">Shift ID: {shiftId}</div>
                <div className="flex items-center gap-2">
                    <SaveIndicator state={saveState} done={recordLocked} />
                    <button
                        type="button"
                        className="text-xs px-3 py-1 border rounded disabled:opacity-50"
                        onClick={handleComplete}
                        disabled={!rid || recordLocked}
                        aria-disabled={!rid || recordLocked}
                        title={recordLocked ? "完了済み" : "保存して完了にする"}
                    >
                        保存（完了）
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
                                                locked={recordLocked}
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
function SaveIndicator({ state, done }: { state: SaveState; done?: boolean }) {
    const text = done
        ? "完了"
        : state === "saving" ? "保存中…" : state === "saved" ? "保存しました" : state === "error" ? "保存に失敗しました" : "";
    const color = done ? "text-blue-600" : state === "error" ? "text-red-600" : state === "saved" ? "text-green-600" : "text-gray-500";
    return <div className={`text-xs ${color}`}>{text}</div>;
}

function FieldRow({ def, value, onChange, shiftInfo, allValues, locked }: {
    def: ShiftRecordItemDef;
    value: unknown;
    onChange: (def: ShiftRecordItemDef, v: unknown) => void;
    shiftInfo: Record<string, unknown> | null;
    allValues: Record<string, unknown>;
    locked: boolean;
}) {
    return (
        <div className="flex flex-col gap-1 opacity-100" style={locked ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
            <label className="text-xs font-medium text-gray-700">
                {def.label}
                {def.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            <ItemInput def={def} value={value} onChange={onChange} shiftInfo={shiftInfo} allValues={allValues} />
            {def.description && <p className="text-[11px] text-gray-500">{def.description}</p>}
        </div>
    );
}

function ItemInput({ def, value, onChange, shiftInfo, allValues }: {
    def: ShiftRecordItemDef;
    value: unknown;
    onChange: (def: ShiftRecordItemDef, v: unknown) => void;
    shiftInfo: Record<string, unknown> | null;
    allValues: Record<string, unknown>;
}) {
    const t = def.input_type;

    // display（読み取り専用テキスト）
    if (t === "display") {
        let text = def.display_text ?? (typeof value === "string" ? value : "");

        // options（文字列JSONでもOK）
        const raw = def.options ?? def.options_json;
        const opt = (Array.isArray(raw) || typeof raw === "object")
            ? (raw as Record<string, unknown>)
            : (() => { try { return JSON.parse(String(raw)); } catch { return {}; } })();

        if (typeof opt.template === "string" && shiftInfo) {
            text = renderTemplate(opt.template, shiftInfo);
        } else if (Array.isArray(opt.ref) && shiftInfo) {
            const parts = opt.ref
                .filter((k): k is string => typeof k === "string")
                .map((k) => shiftInfo[k])
                .map((v) => (v == null ? "" : String(v)))
                .filter(Boolean);
            if (parts.length) text = parts.join(" ");
        }

        // default_value が "me.X" または { me: "X" } のとき、同レコードの値で埋める
        if ((!text || text === "—") && def.default_value && allValues) {
            const pick = (k?: string) => {
                const v = k ? allValues[k] : undefined;
                if (v != null && String(v) !== "") text = String(v);
            };
            if (typeof def.default_value === "string" && def.default_value.startsWith("me.")) {
                pick(def.default_value.slice(3));
            } else if (typeof def.default_value === "object") {
                const r = def.default_value as Record<string, unknown>;
                if (typeof r.me === "string") pick(r.me);
            }
        }

        // 単位を末尾に
        const unit = def.unit ? String(def.unit) : "";
        const out = text ? (unit ? `${text}${unit}` : text) : "—";

        return <div className="text-sm whitespace-pre-wrap break-words">{out}</div>;
    }

    // checkbox（排他 or 複数 or 2択）
    if (t === "checkbox") {
        const raw = def.options ?? def.options_json;

        // {items:[...], exclusive:true} も / 単純配列 [...] も受ける
        const { items: opts, exclusive, multiple } = parseCheckboxOptions(raw, def.exclusive);

        // A) 排他 = ラジオ（N択）
        if (exclusive && opts.length >= 2) {
            const defVal = getDefault(def);
            const raw = value as unknown;
            const cur = String((raw === "" || raw == null) ? (defVal ?? "") : raw);
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
                const defVal = getDefault(def);
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
            const defVal = getDefault(def);
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
            const defVal = getDefault(def);
            const cur = String((value ?? defVal) ?? "");
            return (
                <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={cur === "1"} onChange={(e) => onChange(def, e.target.checked ? "1" : "")} />
                    <span className="text-sm">はい / 実施</span>
                </label>
            );
        }
    }

    if (t === "select") {
        const raw = def.options ?? def.options_json;
        const { items: opts, placeholder } = parseSelectOptions(raw);

        // 既定値（default_value）を空文字でも効かせる
        const defVal = getDefault(def);
        const rawVal = value as unknown;
        const cur = String((rawVal === "" || rawVal == null) ? (defVal ?? "") : rawVal);

        return (
            <select
                className="border rounded px-2 py-1 text-sm"
                value={cur}
                onChange={(e) => onChange(def, e.target.value)}
            >
                <option value="">{`— ${placeholder || "選択してください"} —`}</option>
                {opts.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
        );
    }

    // number
    if (t === "number") {
        const unit = def.unit ? String(def.unit) : "";
        const baseDef = resolveDefaultWithContext(def, shiftInfo);
        const rawVal = value as unknown;
        const cur = String((rawVal === "" || rawVal == null) ? (baseDef ?? "") : rawVal);

        return (
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    className="border rounded px-2 py-1 text-sm"
                    value={cur}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    onChange={(e) => onChange(def, e.target.value === "" ? "" : Number(e.target.value))}
                />
                {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
            </div>
        );
    }

    // textarea
    if (t === "textarea") {
        const baseDef = resolveDefaultWithContext(def, shiftInfo);
        const rawVal = value as unknown;
        const cur = String((rawVal === "" || rawVal == null) ? (baseDef ?? "") : rawVal);

        return (
            <textarea className="border rounded px-2 py-1 text-sm min-h-[84px]" value={cur} onChange={(e) => onChange(def, e.target.value)} />
        );
    }

    // image（URL入力）
    if (t === "image") {
        const baseDef = resolveDefaultWithContext(def, shiftInfo);
        const rawVal = value as unknown;
        const cur = String((rawVal === "" || rawVal == null) ? (baseDef ?? "") : rawVal);

        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <input type="url" className="border rounded px-2 py-1 text-sm flex-1" placeholder="画像URL（将来はアップローダ連携）" value={cur} onChange={(e) => onChange(def, e.target.value)} />
                </div>
                {cur ? (<img src={cur} alt="preview" className="max-h-40 rounded border" />) : (<div className="text-[11px] text-gray-500">画像URLを入力するとプレビューします。</div>)}
            </div>
        );
    }

    // text（デフォルト）
    const unit = def.unit ? String(def.unit) : "";
    const baseDef = resolveDefaultWithContext(def, shiftInfo);
    const rawVal = value as unknown;
    const cur = String((rawVal === "" || rawVal == null) ? (baseDef ?? "") : rawVal);

    return (
        <div className="flex items-center gap-1">
            <input type="text" className="border rounded px-2 py-1 text-sm" value={cur} onChange={(e) => onChange(def, e.target.value)} />
            {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
        </div>
    );
}

// ===== util =====
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
    // 1) { items: [...], exclusive?: boolean }
    const maybeObj = (Array.isArray(raw) || typeof raw !== "object") ? null : (raw as Record<string, unknown>);
    if (maybeObj && Array.isArray(maybeObj.items)) {
        const items = normalizeOptions(maybeObj.items);
        const exclusive = typeof maybeObj.exclusive === "boolean" ? maybeObj.exclusive : !!defExclusive;
        const multiple = typeof maybeObj.multiple === "boolean" ? maybeObj.multiple : false;
        return { items, exclusive, multiple };
    }
    // 2) 単純配列
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
    // 既存の柔軟パーサ（配列/JSON文字列/ゆるい文字列）もそのまま活かす
    return { items: parseOptionsFlexible(raw), placeholder: undefined };
}


function parseOptionsFlexible(v: unknown): OptionKV[] {
    const parsed = Array.isArray(v) ? v : tryParseJSON(v);
    let opts = normalizeOptions(parsed);
    if (opts.length > 0) return opts;
    if (typeof v === "string") {
        const s = loosenJSONString(v);
        const asArray = coerceToArrayJSON(s);
        const parsed2 = tryParseJSON(asArray);
        opts = normalizeOptions(parsed2);
        if (opts.length > 0) return opts;
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

function getDefault(def: ShiftRecordItemDef): unknown {
    return typeof def.default_value !== "undefined" ? def.default_value : def.default;
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

// ShiftRecord.tsx 内（util群の近く）
function resolveDefaultWithContext(def: ShiftRecordItemDef, ctx: Record<string, unknown> | null): unknown {
    const raw = typeof def.default_value !== "undefined" ? def.default_value : def.default;

    // 1) そのままスカラ値
    if (raw == null || typeof raw === "number" || typeof raw === "boolean") return raw;

    // 2) 文字列： "{{key}}" 単体 or 任意テンプレート
    if (typeof raw === "string") {
        const s = raw.trim();
        if (ctx && /\{\{.+\}\}/.test(s)) {
            return renderTemplate(s, ctx); // 既存のテンプレ関数を流用
        }
        return raw;
    }

    // 3) オブジェクト記法:
    //   { ref: "standard_route" }         -> ctx["standard_route"]
    //   { template: "A: {{standard_purpose}} / {{standard_route}}" }
    if (raw && typeof raw === "object" && ctx) {
        const r = raw as Record<string, unknown>;
        if (typeof r.ref === "string") {
            const v = ctx[r.ref];
            return v == null ? "" : String(v);
        }
        if (typeof r.template === "string") {
            return renderTemplate(r.template, ctx);
        }
    }
    return raw;
}
