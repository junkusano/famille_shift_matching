"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Send, EyeOff, Eye } from "lucide-react";

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

type ShiftWishRow = {
    id: string;
    user_id: string;
    request_type?: string;
    preferred_date?: string | null;
    preferred_weekday?: string | null;
    time_start_hour?: number | null;
    time_end_hour?: number | null;
    postal_area_json?: string | null;
    area_text?: string | null;
    full_name?: string | null;
    gender?: string | null;
    qual_text?: string | null;
    created_at?: string;
    updated_at?: string;
    schedule_text?: string | null;
    fax_name_masked?: string | null;
};

export default function ShiftWishPage() {
    const [rows, setRows] = useState<ShiftWishRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [hideNames, setHideNames] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch("/api/shift-wish", { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: ShiftWishRow[] = await res.json();
                setRows(data);
            } catch (e: unknown) {
                if (e instanceof Error) {
                    setError(e.message);
                } else {
                    setError(String(e));
                }
            } finally {
                setLoading(false);
            }
        };
        run();
    }, []);

    const filtered = useMemo(() => {
        if (!search) return rows;
        const s = search.toLowerCase();
        return rows.filter(r => {
            const blob = [
                r.full_name,
                r.gender,
                r.area_text,
                r.schedule_text,
                r.qual_text,
            ].join(" ").toLowerCase();
            return blob.includes(s);
        });
    }, [rows, search]);

    const toggleSelectAll = (checked: boolean) => {
        const obj: Record<string, boolean> = {};
        filtered.forEach(r => (obj[r.id] = checked));
        setSelected(obj);
    };

    const exportCsv = () => {
        const headers = [
            "ID",
            "氏名/非公開",
            "性別",
            "希望エリア",
            "希望日時",
            "資格",
            "種別",
        ];
        const lines = [headers.join(",")];
        filtered.forEach(r => {
            lines.push([
                r.id,
                `"${hideNames ? r.fax_name_masked : r.full_name}"`,
                r.gender || "",
                `"${r.area_text || ""}"`,
                `"${r.schedule_text || ""}"`,
                `"${r.qual_text || ""}"`,
                r.request_type || "",
            ].join(","));
        });
        const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=Shift_JIS" });
        downloadBlob(blob, "shift_wish_export.csv");
    };

    const makeFaxText = () => {
        const selectedRows = filtered.filter(r => selected[r.id]);
        const target = (selectedRows.length ? selectedRows : filtered).slice(0, 50);
        const body = target
            .map((r, i) => `${i + 1}. ${r.fax_name_masked}\n   地域: ${r.area_text}\n   時間: ${r.schedule_text}\n   資格: ${r.qual_text}`)
            .join("\n\n");
        const header = `【シフト希望のご案内】\n（氏名はFAX送信用に非公開表示）\n\n`;
        return header + body;
    };

    const downloadFaxTxt = () => {
        const blob = new Blob([makeFaxText()], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, "fax_shift_wish.txt");
    };

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <h1 className="text-2xl font-semibold">シフト希望一覧（/portal/shift_wish）</h1>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                    <Input placeholder="検索（地域・時間・資格・性別・氏名）" value={search} onChange={e => setSearch(e.target.value)} className="w-[260px]" />
                    <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />CSV</Button>
                    <Button onClick={downloadFaxTxt}><Send className="w-4 h-4 mr-1" />FAX用TXT</Button>
                    <Button variant="outline" onClick={() => setHideNames(s => !s)}>
                        {hideNames ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />} 氏名{hideNames ? "表示" : "非表示"}
                    </Button>
                </div>
            </div>

            <Card className="shadow-sm">
                <CardContent className="p-0 overflow-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr className="text-left">
                                <th className="p-3 w-10"><Checkbox checked={filtered.every(r => selected[r.id]) && filtered.length > 0} onCheckedChange={v => toggleSelectAll(Boolean(v))} /></th>
                                <th className="p-3">氏名</th>
                                <th className="p-3">性別</th>
                                <th className="p-3">希望エリア</th>
                                <th className="p-3">希望日時</th>
                                <th className="p-3">資格</th>
                                <th className="p-3">種別</th>
                                <th className="p-3">更新</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td className="p-3" colSpan={8}>読み込み中...</td></tr>
                            )}
                            {error && (
                                <tr><td className="p-3 text-red-600" colSpan={8}>{error}</td></tr>
                            )}
                            {!loading && !error && filtered.map(r => (
                                <tr key={r.id} className="border-t">
                                    <td className="p-3 align-top">
                                        <Checkbox checked={!!selected[r.id]} onCheckedChange={v => setSelected(prev => ({ ...prev, [r.id]: Boolean(v) }))} />
                                    </td>
                                    <td className="p-3 align-top whitespace-pre-wrap">{hideNames ? r.fax_name_masked : r.full_name}</td>
                                    <td className="p-3 align-top">{r.gender ?? ""}</td>
                                    <td className="p-3 align-top whitespace-pre-wrap">{r.area_text}</td>
                                    <td className="p-3 align-top">{r.schedule_text}</td>
                                    <td className="p-3 align-top whitespace-pre-wrap">{r.qual_text}</td>
                                    <td className="p-3 align-top">{r.request_type ?? ""}</td>
                                    <td className="p-3 align-top">{r.updated_at?.slice(0, 10)}</td>
                                </tr>
                            ))}
                            {!loading && !error && filtered.length === 0 && (
                                <tr><td className="p-3" colSpan={8}>該当なし</td></tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <div className="text-xs text-gray-500">
                ※「FAX用TXT」は氏名を自動で非公開表記に切り替えて書き出します。FAX送信前に差し込み編集してください。
            </div>
        </div>
    );
}