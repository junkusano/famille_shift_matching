// components/shift/ShiftRecord.tsx
"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import type {
    ShiftRecordCategoryL, ShiftRecordCategoryS, ShiftRecordItemDef
} from "@/types/shift-record-def";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ShiftRecord({ shiftId, recordId, onSavedStatusChange }: {
    shiftId: string; recordId?: string; onSavedStatusChange?: (s: SaveState) => void;
}) {
    const [defs, setDefs] = useState<{
        L: ShiftRecordCategoryL[]; S: ShiftRecordCategoryS[]; items: ShiftRecordItemDef[];
    }>({ L: [], S: [], items: [] });
    void defs;

    const [rid, setRid] = useState<string | undefined>(recordId);
    const [values, setValues] = useState<Record<string, unknown>>({}); // key=item_def_id

    void values;

    // 定義を取得
    useEffect(() => {
        (async () => {
            const [l, s, d] = await Promise.all([
                fetch("/api/shift-record-def/category-l").then(r => r.json()),
                fetch("/api/shift-record-def/category-s").then(r => r.json()),
                fetch("/api/shift-record-def/item-defs").then(r => r.json()),
            ]);
            setDefs({ L: l, S: s, items: d });
        })();
    }, []);

    // レコードを確保（既存 or 新規ドラフト）
    useEffect(() => {
        (async () => {
            if (recordId) { setRid(recordId); return; }
            const res = await fetch(`/api/shift-records?shift_id=${encodeURIComponent(shiftId)}`);
            if (res.ok) {
                const data = await res.json(); // {id, values: {[item_def_id]: any}}
                setRid(data.id);
                setValues(data.values ?? {});
            } else {
                const r2 = await fetch(`/api/shift-records`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shift_id: shiftId, status: "draft" }),
                });
                const d2 = await r2.json();
                setRid(d2.id);
                setValues({});
            }
        })();
    }, [shiftId, recordId]);

    // 値変更 → 自動保存（500ms）
    const [saveState, setSaveState] = useState<SaveState>("idle");
    useEffect(() => { onSavedStatusChange?.(saveState); }, [saveState, onSavedStatusChange]);

    const saveDebounced = useMemo(() => {
        let t: ReturnType<typeof setTimeout>; // ← any をやめて明示
        return (payload: unknown) => {
            setSaveState("saving");
            clearTimeout(t);
            t = setTimeout(async () => {
                try {
                    await fetch(`/api/shift-records/${rid}/values`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload), // [{item_def_id, value_*}, ...]
                    });
                    setSaveState("saved");
                } catch {
                    setSaveState("error");
                }
            }, 500);
        };
    }, [rid]);

    const onChange = useCallback((def: ShiftRecordItemDef, v: unknown) => {
        setValues(prev => {
            const next = { ...prev, [def.id]: v };
            // 送信用に差分を1件ずつ upsert（まとめたい場合はバッチでもOK）
            saveDebounced([{ item_def_id: def.id, value: v }]);
            return next;
        });
    }, [saveDebounced]);
    void onChange;

    // ここで L→S→Item の順に UI をレンダリング（例：左タブL/右にSと項目…）
    // input_type（checkbox/select/number/text/textarea/image/display）で分岐:contentReference[oaicite:6]{index=6}
    // …（UI実装は省略・既存の定義型に準拠）…

    return (
        <div className="space-y-3">
            {/* Tabs + Items ... */}
            <div className="text-xs text-muted-foreground">
                {saveState === "saving" && "保存中…"}
                {saveState === "saved" && "保存しました"}
                {saveState === "error" && "保存に失敗しました"}
            </div>
        </div>
    );
}