"use client";
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Save, RefreshCcw, Eye, Calendar as CalIcon } from "lucide-react";

// =========================
// Types
// =========================
export type TemplateRow = {
    template_id?: number;
    kaipoke_cs_id: string;
    weekday: number; // 0(日)-6(土)
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    service_code: string;
    required_staff_count: number;
    two_person_work_flg: boolean;
    judo_ido?: string | null;
    staff_01_user_id?: string | null;
    staff_02_user_id?: string | null;
    staff_03_user_id?: string | null;
    staff_02_attend_flg: boolean;
    staff_03_attend_flg: boolean;
    staff_01_role_code?: string | null; // "-999" | "01" | "02"
    staff_02_role_code?: string | null;
    staff_03_role_code?: string | null;
    active: boolean;
    effective_from?: string | null; // YYYY-MM-DD
    effective_to?: string | null;   // YYYY-MM-DD
    is_biweekly?: boolean | null;
    nth_weeks?: number[] | null; // [1..5]
    _cid?: string;        // client helper
    _selected?: boolean;  // client helper
};

export type PreviewRow = {
    kaipoke_cs_id: string;
    shift_start_date: string; // YYYY-MM-DD
    shift_start_time: string; // HH:MM:SS
    shift_end_time: string;   // HH:MM:SS
    service_code: string;
    required_staff_count: number;
    two_person_work_flg: boolean;
    judo_ido: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    staff_02_attend_flg: boolean;
    staff_03_attend_flg: boolean;
    staff_01_role_code: string | null;
    staff_02_role_code: string | null;
    staff_03_role_code: string | null;
    has_conflict: boolean;
};

// =========================
// Helpers
// =========================
const WEEKS_JP = ["日", "月", "火", "水", "木", "金", "土"];
const TZ = "Asia/Tokyo";

function nowYYYYMM() {
    const d = new Date();
    const y = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric" }).format(d);
    const m = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "2-digit" }).format(d);
    return y + "-" + m;
}

function newEmptyRow(cs: string): TemplateRow {
    return {
        kaipoke_cs_id: cs,
        weekday: 1,
        start_time: "09:00",
        end_time: "10:00",
        service_code: "",
        required_staff_count: 1,
        two_person_work_flg: false,
        judo_ido: null,
        staff_01_user_id: null,
        staff_02_user_id: null,
        staff_03_user_id: null,
        staff_02_attend_flg: false,
        staff_03_attend_flg: false,
        staff_01_role_code: null,
        staff_02_role_code: null,
        staff_03_role_code: null,
        active: true,
        effective_from: null,
        effective_to: null,
        is_biweekly: null,
        nth_weeks: null,
        _cid: (typeof crypto !== "undefined" && "randomUUID" in crypto)
            ? crypto.randomUUID()
            : String(Math.random()),
        _selected: false,
    };
}

function validateRow(r: TemplateRow): string[] {
    const errs: string[] = [];
    const re = /^\d{2}:\d{2}$/;
    if (!re.test(r.start_time)) errs.push("開始時刻の形式が不正です");
    if (!re.test(r.end_time)) errs.push("終了時刻の形式が不正です");
    if (re.test(r.start_time) && re.test(r.end_time) && r.end_time <= r.start_time) {
        errs.push("終了時刻は開始より後である必要があります");
    }
    if (r.weekday < 0 || r.weekday > 6) errs.push("曜日が不正です");
    if (!r.service_code) errs.push("サービス内容（service_code）を入力してください");
    if (r.required_staff_count < 1) errs.push("派遣人数は1以上にしてください");
    if (r.nth_weeks && r.nth_weeks.some((n) => n < 1 || n > 5)) errs.push("第n週は1〜5で指定してください");
    if (r.judo_ido && !/^([0-2][0-9][0-5][0-9])$/.test(r.judo_ido)) errs.push("重訪移動（judo_ido）はHHMM形式");
    const rolesOk = (x?: string | null) => !x || x === "-999" || x === "01" || x === "02";
    if (!rolesOk(r.staff_01_role_code) || !rolesOk(r.staff_02_role_code) || !rolesOk(r.staff_03_role_code)) {
        errs.push("ロールコードは '-999' / '01' / '02' のみ有効です");
    }
    return errs;
}

function hasDuplicate(rows: TemplateRow[]): boolean {
    const key = (r: TemplateRow) => r.kaipoke_cs_id + "|" + r.weekday + "|" + r.start_time;
    const set = new Set<string>();
    for (const r of rows) {
        const k = key(r);
        if (set.has(k)) return true;
        set.add(k);
    }
    return false;
}

// =========================
// API wrappers
// =========================
async function apiFetchTemplates(cs: string): Promise<TemplateRow[]> {
    const res = await fetch("/api/roster/weekly/templates?kaipoke_cs_id=" + encodeURIComponent(cs));
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { rows?: TemplateRow[] };
    const base = data && data.rows ? data.rows : [];
    return base.map((r) => ({ ...r, _cid: String(Math.random()), _selected: false }));
}

async function apiBulkUpsert(rows: Omit<TemplateRow, "_cid" | "_selected">[]) {
    const res = await fetch("/api/roster/weekly/templates/bulk_upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiBulkDelete(templateIds: number[]) {
    const res = await fetch("/api/roster/weekly/templates/bulk_delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_ids: templateIds }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiPreviewMonth(month: string, cs: string, useRecurrence: boolean): Promise<PreviewRow[]> {
    const q = new URLSearchParams({ month, kaipoke_cs_id: cs, recurrence: String(useRecurrence) });
    const res = await fetch("/api/roster/weekly/preview?" + q.toString());
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { rows?: PreviewRow[] };
    return data && data.rows ? data.rows : [];
}

// =========================
// UI Bits
// =========================
const Pill: React.FC<{ label: string; tone?: "ok" | "warn" | "muted" }> = ({ label, tone = "muted" }) => {
    const cls = [
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
        tone === "ok" ? "bg-green-50 border-green-200 text-green-700" : "",
        tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-700" : "",
        tone === "muted" ? "bg-slate-50 border-slate-200 text-slate-600" : "",
    ]
        .filter(Boolean)
        .join(" ");
    return <span className={cls}>{label}</span>;
};

const ToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }> = ({
    icon,
    className,
    children,
    ...props
}) => {
    const cls = [
        "inline-flex items-center gap-2 rounded-2xl px-3 py-2",
        "shadow-sm border border-slate-200 bg-white hover:bg-slate-50",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className || "",
    ].join(" ");
    return (
        <button {...props} className={cls}>
            {icon}
            <span className="text-sm font-medium">{children}</span>
        </button>
    );
};

const TableHeadCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, className, ...rest }) => {
    const cls = ["text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b", className || ""].join(" ");
    return (
        <th {...rest} className={cls}>
            {children}
        </th>
    );
};

const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ children, className, ...rest }) => {
    const cls = ["px-2 py-2 align-top border-b", className || ""].join(" ");
    return (
        <td {...rest} className={cls}>
            {children}
        </td>
    );
};

// =========================
// Main Page
// =========================
export default function WeeklyRosterPage() {
    const [month, setMonth] = useState(nowYYYYMM());
    const [cs, setCs] = useState("");
    const [rows, setRows] = useState<TemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<PreviewRow[] | null>(null);
    const [useRecurrence, setUseRecurrence] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const duplicate = useMemo(() => hasDuplicate(rows), [rows]);
    const invalidCount = useMemo(() => rows.reduce((acc, r) => acc + validateRow(r).length, 0), [rows]);

    const totalMinutes = useMemo(() => {
        const toMin = (hhmm: string) => {
            const parts = hhmm.split(":").map((x) => Number(x));
            return parts[0] * 60 + parts[1];
        };
        return rows.reduce((acc, r) => acc + Math.max(0, toMin(r.end_time) - toMin(r.start_time)), 0);
    }, [rows]);

    function addRow() {
        if (!cs) {
            alert("先に利用者ID(kaipoke_cs_id)を入力してください");
            return;
        }
        setRows((rs) => rs.concat([newEmptyRow(cs)]));
    }

    function updateRow(cid: string, patch: Partial<TemplateRow>) {
        setRows((rs) => rs.map((r) => (r._cid === cid ? { ...r, ...patch } : r)));
    }

    function removeSelected() {
        const idsToDelete = rows
            .filter((r) => !!r._selected && !!r.template_id)
            .map((r) => r.template_id as number);
        const remaining = rows.filter((r) => !r._selected);
        if (idsToDelete.length === 0) {
            setRows(remaining);
            return;
        }
        if (!confirm(idsToDelete.length + "件の既存テンプレを削除します。よろしいですか？")) return;
        setLoading(true);
        apiBulkDelete(idsToDelete)
            .then(() => setRows(remaining))
            .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
    }

    async function load() {
        if (!cs) {
            alert("利用者IDを入力してください");
            return;
        }
        setLoading(true);
        setError(null);
        setPreview(null);
        try {
            const data = await apiFetchTemplates(cs);
            setRows(data);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    async function saveAll() {
        const allErrs = rows.flatMap((r, i) => validateRow(r).map((m) => "#" + (i + 1) + ": " + m));
        if (duplicate) {
            alert("同一曜日・開始時刻の重複があります。修正してください。");
            return;
        }
        if (allErrs.length) {
            const head = allErrs.slice(0, 5).join("\n");
            const msg = ["警告:", head, "...他" + allErrs.length + "件", "保存を続行しますか？"].join("\n");
            if (!confirm(msg)) return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload: Omit<TemplateRow, "_cid" | "_selected">[] =
                rows.map(({ _cid: _omitCid, _selected: _omitSel, ...rest }) => rest);
            await apiBulkUpsert(payload);
            await load();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    async function doPreview() {
        if (!cs) {
            alert("利用者IDを入力してください");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const p = await apiPreviewMonth(month, cs, useRecurrence);
            setPreview(p);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col">
                    <label className="text-xs text-slate-500">月 (YYYY-MM)</label>
                    <div className="relative">
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="border rounded-xl px-3 py-2 pr-9"
                        />
                        <CalIcon className="w-4 h-4 absolute right-2 top-2.5 text-slate-400" />
                    </div>
                </div>
                <div className="flex flex-col">
                    <label className="text-xs text-slate-500">利用者ID（kaipoke_cs_id）</label>
                    <input
                        value={cs}
                        onChange={(e) => setCs(e.target.value)}
                        placeholder="例: 10541010"
                        className="border rounded-xl px-3 py-2 min-w-[200px]"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <ToolbarButton onClick={load} disabled={!cs || loading} icon={<RefreshCcw className="w-4 h-4" />}>
                        読み込み
                    </ToolbarButton>
                    <ToolbarButton onClick={addRow} disabled={!cs} icon={<Plus className="w-4 h-4" />}>
                        行を追加
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={removeSelected}
                        disabled={rows.every((r) => !r._selected)}
                        icon={<Trash2 className="w-4 h-4" />}
                    >
                        選択削除
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={saveAll}
                        disabled={!rows.length || saving || duplicate}
                        icon={<Save className="w-4 h-4" />}
                    >
                        保存
                    </ToolbarButton>
                    <ToolbarButton onClick={doPreview} disabled={!cs || loading} icon={<Eye className="w-4 h-4" />}>
                        月展開プレビュー
                    </ToolbarButton>
                </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-2">
                <Pill label={"行数: " + rows.length} />
                <Pill label={"合計時間: " + (totalMinutes / 60).toFixed(1) + "h"} />
                {duplicate ? <Pill tone="warn" label="重複 (同曜日×開始時刻) あり" /> : null}
                {invalidCount > 0 ? <Pill tone="warn" label={"警告 " + invalidCount + "件"} /> : null}
                {useRecurrence ? <Pill tone="ok" label="隔週/第n週 有効" /> : <Pill tone="muted" label="隔週/第n週 無効" />}
                <button className="text-xs underline text-slate-600" onClick={() => setUseRecurrence((v) => !v)}>
                    切り替え
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 gap-3">
                <div className="overflow-auto rounded-2xl border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <TableHeadCell>選択</TableHeadCell>
                                <TableHeadCell>曜日</TableHeadCell>
                                <TableHeadCell>提供時間</TableHeadCell>
                                <TableHeadCell>サービス</TableHeadCell>
                                <TableHeadCell>人数/2人従事</TableHeadCell>
                                <TableHeadCell>重訪移動</TableHeadCell>
                                <TableHeadCell>担当(1/2/3)</TableHeadCell>
                                <TableHeadCell>ロール(1/2/3)</TableHeadCell>
                                <TableHeadCell>有効期間</TableHeadCell>
                                <TableHeadCell>隔週/第n週</TableHeadCell>
                                <TableHeadCell>Active</TableHeadCell>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const errs = validateRow(r);
                                return (
                                    <tr key={r._cid} className={errs.length ? "bg-amber-50" : ""}>
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                checked={!!r._selected}
                                                onChange={(e) => updateRow(r._cid as string, { _selected: e.target.checked })}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <select
                                                value={r.weekday}
                                                onChange={(e) => updateRow(r._cid as string, { weekday: Number(e.target.value) })}
                                                className="border rounded-lg px-2 py-1"
                                            >
                                                {WEEKS_JP.map((w, i) => (
                                                    <option key={i} value={i}>
                                                        {w}
                                                    </option>
                                                ))}
                                            </select>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="time"
                                                    value={r.start_time}
                                                    onChange={(e) => updateRow(r._cid as string, { start_time: e.target.value })}
                                                    className="border rounded-lg px-2 py-1"
                                                />
                                                <span className="text-slate-400">〜</span>
                                                <input
                                                    type="time"
                                                    value={r.end_time}
                                                    onChange={(e) => updateRow(r._cid as string, { end_time: e.target.value })}
                                                    className="border rounded-lg px-2 py-1"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <input
                                                value={r.service_code}
                                                onChange={(e) => updateRow(r._cid as string, { service_code: e.target.value })}
                                                placeholder="身体/重訪Ⅱ など"
                                                className="border rounded-lg px-2 py-1 w-36"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={r.required_staff_count}
                                                    onChange={(e) =>
                                                        updateRow(r._cid as string, { required_staff_count: Number(e.target.value) })
                                                    }
                                                    className="border rounded-lg px-2 py-1 w-16"
                                                />
                                                <label className="inline-flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={r.two_person_work_flg}
                                                        onChange={(e) => updateRow(r._cid as string, { two_person_work_flg: e.target.checked })}
                                                    />
                                                    2人従事
                                                </label>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <input
                                                value={r.judo_ido || ""}
                                                onChange={(e) => updateRow(r._cid as string, { judo_ido: e.target.value || null })}
                                                placeholder="例: 0015"
                                                className="border rounded-lg px-2 py-1 w-20"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        value={r.staff_01_user_id || ""}
                                                        onChange={(e) =>
                                                            updateRow(r._cid as string, { staff_01_user_id: e.target.value || null })
                                                        }
                                                        placeholder="staff1"
                                                        className="border rounded-lg px-2 py-1 w-32"
                                                    />
                                                    <span className="text-xs text-slate-400">出動</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        value={r.staff_02_user_id || ""}
                                                        onChange={(e) =>
                                                            updateRow(r._cid as string, { staff_02_user_id: e.target.value || null })
                                                        }
                                                        placeholder="staff2"
                                                        className="border rounded-lg px-2 py-1 w-32"
                                                    />
                                                    <label className="text-xs inline-flex items-center gap-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={r.staff_02_attend_flg}
                                                            onChange={(e) =>
                                                                updateRow(r._cid as string, { staff_02_attend_flg: e.target.checked })
                                                            }
                                                        />{" "}
                                                        同行
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        value={r.staff_03_user_id || ""}
                                                        onChange={(e) =>
                                                            updateRow(r._cid as string, { staff_03_user_id: e.target.value || null })
                                                        }
                                                        placeholder="staff3"
                                                        className="border rounded-lg px-2 py-1 w-32"
                                                    />
                                                    <label className="text-xs inline-flex items-center gap-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={r.staff_03_attend_flg}
                                                            onChange={(e) =>
                                                                updateRow(r._cid as string, { staff_03_attend_flg: e.target.checked })
                                                            }
                                                        />{" "}
                                                        同行
                                                    </label>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <input
                                                    value={r.staff_01_role_code || ""}
                                                    onChange={(e) =>
                                                        updateRow(r._cid as string, { staff_01_role_code: e.target.value || null })
                                                    }
                                                    placeholder="-999/01/02"
                                                    className="border rounded-lg px-2 py-1 w-24"
                                                />
                                                <input
                                                    value={r.staff_02_role_code || ""}
                                                    onChange={(e) =>
                                                        updateRow(r._cid as string, { staff_02_role_code: e.target.value || null })
                                                    }
                                                    placeholder="-999/01/02"
                                                    className="border rounded-lg px-2 py-1 w-24"
                                                />
                                                <input
                                                    value={r.staff_03_role_code || ""}
                                                    onChange={(e) =>
                                                        updateRow(r._cid as string, { staff_03_role_code: e.target.value || null })
                                                    }
                                                    placeholder="-999/01/02"
                                                    className="border rounded-lg px-2 py-1 w-24"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="date"
                                                    value={r.effective_from || ""}
                                                    onChange={(e) =>
                                                        updateRow(r._cid as string, { effective_from: e.target.value || null })
                                                    }
                                                    className="border rounded-lg px-2 py-1"
                                                />
                                                <span className="text-slate-400">〜</span>
                                                <input
                                                    type="date"
                                                    value={r.effective_to || ""}
                                                    onChange={(e) => updateRow(r._cid as string, { effective_to: e.target.value || null })}
                                                    className="border rounded-lg px-2 py-1"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs inline-flex items-center gap-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!r.is_biweekly}
                                                        onChange={(e) => updateRow(r._cid as string, { is_biweekly: e.target.checked })}
                                                    />{" "}
                                                    隔週
                                                </label>
                                                <input
                                                    value={(r.nth_weeks || []).join(",")}
                                                    onChange={(e) => {
                                                        const v = e.target.value
                                                            ? e.target.value
                                                                .split(",")
                                                                .map((x) => Number(x.trim()))
                                                                .filter((n) => !!n)
                                                            : [];
                                                        updateRow(r._cid as string, { nth_weeks: v });
                                                    }}
                                                    placeholder="第n週(例: 1,3,5)"
                                                    className="border rounded-lg px-2 py-1 w-28"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <label className="inline-flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={r.active}
                                                    onChange={(e) => updateRow(r._cid as string, { active: e.target.checked })}
                                                />
                                                <span className="text-xs text-slate-600">{r.active ? "有効" : "無効"}</span>
                                            </label>
                                            {errs.length > 0 ? (
                                                <div className="mt-1 text-[11px] text-amber-700 space-y-0.5">
                                                    {errs.slice(0, 3).map((m, i) => (
                                                        <div key={i}>• {m}</div>
                                                    ))}
                                                    {errs.length > 3 ? <div>…他{errs.length - 3}件</div> : null}
                                                </div>
                                            ) : null}
                                        </TableCell>
                                    </tr>
                                );
                            })}
                            {rows.length === 0 ? (
                                <tr>
                                    <td className="text-center text-slate-400 py-8" colSpan={11}>
                                        テンプレ行がありません。「読み込み」または「行を追加」をクリック
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Preview Panel */}
            <div>
                {preview ? (
                    <div className="rounded-2xl border overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
                            <div className="text-sm text-slate-700">{month} の展開プレビュー（{cs || "全員"}）</div>
                            <div className="text-xs text-slate-500">{useRecurrence ? "隔週/第n週: 有効" : "隔週/第n週: 無効"}</div>
                        </div>
                        <div className="max-h-[50vh] overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-white sticky top-0 shadow-sm">
                                    <tr>
                                        <TableHeadCell>日付</TableHeadCell>
                                        <TableHeadCell>曜日</TableHeadCell>
                                        <TableHeadCell>提供時間</TableHeadCell>
                                        <TableHeadCell>サービス</TableHeadCell>
                                        <TableHeadCell>人数/2人従事</TableHeadCell>
                                        <TableHeadCell>担当</TableHeadCell>
                                        <TableHeadCell>衝突</TableHeadCell>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.map((p, i) => {
                                        const d = new Date(p.shift_start_date);
                                        const wd = d.getDay();
                                        return (
                                            <tr key={i} className="border-b">
                                                <TableCell>{p.shift_start_date}</TableCell>
                                                <TableCell>{WEEKS_JP[wd]}</TableCell>
                                                <TableCell>
                                                    {p.shift_start_time.substring(0, 5)}〜{p.shift_end_time.substring(0, 5)}
                                                </TableCell>
                                                <TableCell>{p.service_code}</TableCell>
                                                <TableCell>{p.required_staff_count}{p.two_person_work_flg ? " / 2人従事" : ""}</TableCell>
                                                <TableCell className="text-xs text-slate-600">
                                                    {p.staff_01_user_id || "-"}
                                                    {p.staff_02_user_id ? " / " + p.staff_02_user_id + (p.staff_02_attend_flg ? "(同)" : "") : ""}
                                                    {p.staff_03_user_id ? " / " + p.staff_03_user_id + (p.staff_03_attend_flg ? "(同)" : "") : ""}
                                                </TableCell>
                                                <TableCell>{p.has_conflict ? <Pill tone="warn" label="重なり有" /> : <Pill tone="ok" label="OK" />}</TableCell>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}
            </div>

            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            {/* Footer tips */}
            <div className="text-xs text-slate-500 space-y-1">
                <div>
                    ・この画面は <strong>週間テンプレ（shift_weekly_template）</strong> の編集専用です。月間シフト（shift）には直接書き込みません。
                </div>
                <div>・「月展開プレビュー」は <code>shift_weekly_template_month_preview</code> ビューを呼ぶAPIを想定しています。</div>
            </div>
        </div>
    );
}
