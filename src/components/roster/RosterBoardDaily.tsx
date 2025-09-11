// ----------------------------------------------
// components/roster/RosterBoardDaily.tsx
// ----------------------------------------------
"use client";
import React, { useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";

// shadcn/ui（プロジェクトに合わせてimportパス調整）
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import type { CheckedState } from "@radix-ui/react-checkbox";

// --- グリッド設定 ---
const SLOT_MINUTES = 15; // 15分刻み
const ROW_PX = 16;       // 15分1マスの高さ
const COLS = 24;         // 24h（1時間=1列）

function timeToMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(min: number) { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function snap(min: number) { return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES; }

export default function RosterBoardDaily({ date, initialView }: { date: string; initialView: RosterDailyView; }) {
    const [view, setView] = useState<RosterDailyView>(initialView);
    const [filters, setFilters] = useState<{ teams: string[]; levels: string[] }>({ teams: [], levels: [] });
    const day = parseISO(date);

    // 並び: team → level → name（昇順）
    const staffSorted = useMemo(() => {
        const inTeam = (s: RosterStaff) => (filters.teams.length ? filters.teams.includes(s.team || "") : true);
        const inLevel = (s: RosterStaff) => (filters.levels.length ? filters.levels.includes(s.level || "") : true);
        return view.staff
            .filter(s => inTeam(s) && inLevel(s))
            .sort((a, b) => (a.team || "").localeCompare(b.team || "") || (a.level || "").localeCompare(b.level || "") || a.name.localeCompare(b.name));
    }, [view.staff, filters]);

    const rowIndexById = useMemo(() => {
        const map = new Map<string, number>();
        staffSorted.forEach((s, i) => map.set(s.id, i));
        return map;
    }, [staffSorted]);

    // フィルタ後のカード
    const cards = useMemo(() => view.shifts.filter(c => rowIndexById.has(c.staff_id)), [view.shifts, rowIndexById]);

    const allTeams = useMemo(() => Array.from(new Set(view.staff.map(s => s.team).filter(Boolean))) as string[], [view.staff]);
    const allLevels = useMemo(() => Array.from(new Set(view.staff.map(s => s.level).filter(Boolean))) as string[], [view.staff]);

    const containerRef = useRef<HTMLDivElement>(null);

    function commitChange(update: Partial<RosterShiftCard> & { id: string }) {
        setView(prev => ({
            ...prev,
            shifts: prev.shifts.map(s => s.id === update.id ? { ...s, ...update, start_at: update.start_at ?? s.start_at, end_at: update.end_at ?? s.end_at, staff_id: update.staff_id ?? s.staff_id } : s)
        }));

        // TODO: APIに保存（必要ならdebounce）
        // fetch(`/api/roster/shifts/${update.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    }

    // ドラッグ中の簡易オートスクロール
    function autoScroll(y: number) {
        const el = containerRef.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        const threshold = 60; const speed = 12;
        if (y < rect.top + threshold) el.scrollTop -= speed;
        else if (y > rect.bottom - threshold) el.scrollTop += speed;
    }

    const dayLabel = format(day, "yyyy年M月d日(E)", { locale: ja });

    return (
        <div className="w-full h-full">
            {/* ヘッダー（ナビ） */}
            <div className="flex items-center justify-center gap-2 mb-3 select-none">
                <a href={`?date=${format(addDays(day, -1), "yyyy-MM-dd")}`} aria-label="前日"><Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button></a>
                <div className="text-xl font-semibold px-3 flex items-center gap-2"><CalendarIcon className="h-5 w-5" /><span>{dayLabel}</span></div>
                <a href={`?date=${format(addDays(day, 1), "yyyy-MM-dd")}`} aria-label="翌日"><Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button></a>
                <form className="ml-2" action="" method="get">
                    <Input type="date" name="date" defaultValue={format(day, "yyyy-MM-dd")} className="h-8" />
                </form>
            </div>

            {/* フィルタ */}
            <div className="flex items-start gap-6 mb-3">
                <div>
                    <Label className="block mb-1">チーム</Label>
                    <div className="flex flex-wrap gap-2 max-w-[900px]">
                        {allTeams.map(t => (
                            <label key={t} className="text-sm inline-flex items-center gap-2 border rounded px-2 py-1">
                                <Checkbox
                                    checked={filters.teams.includes(t)}
                                    onCheckedChange={(v: CheckedState) => {
                                        const checked = v === true;
                                        setFilters(f => ({
                                            ...f,
                                            teams: checked ? [...f.teams, t] : f.teams.filter(x => x !== t)
                                        }));
                                    }}
                                />
                                <span>{t}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <Label className="block mb-1">レベル</Label>
                    <div className="flex flex-wrap gap-2 max-w-[900px]">
                        {allLevels.map(l => (
                            <label key={l} className="text-sm inline-flex items-center gap-2 border rounded px-2 py-1">
                                <Checkbox
                                    checked={filters.levels.includes(l)}
                                    onCheckedChange={(v: CheckedState) => {
                                        const checked = v === true;
                                        setFilters(f => ({
                                            ...f,
                                            levels: checked ? [...f.levels, l] : f.levels.filter(x => x !== l)
                                        }));
                                    }}
                                /><span>{l}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* ボード */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                <div className="grid" style={{ gridTemplateColumns: `240px 1fr` }}>
                    {/* 左：スタッフリスト */}
                    <div className="border-r bg-slate-50 p-2">
                        <div className="text-sm font-semibold mb-2">割当ヘルパー</div>
                        <div className="space-y-2 max-h-[640px] overflow-y-auto pr-2">
                            {staffSorted.map((s) => (
                                <div key={s.id} className="px-2 py-1 rounded-md text-sm bg-white flex items-center justify-between border">
                                    <span className="truncate" title={`${s.team || ""} ${s.level || ""} ${s.name}`}>
                                        {s.team ? `[${s.team}] ` : ""}{s.level ? `${s.level} ` : ""}{s.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 右：時間軸 + カード */}
                    <div className="relative">
                        {/* 固定ヘッダー（時間目盛） */}
                        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-2 py-1 border-b">
                            <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(52px, 1fr))` }}>
                                {Array.from({ length: COLS }).map((_, h) => (
                                    <div key={h} className="text-[10px] text-gray-500 text-center">{String(h).padStart(2, "0")}:00</div>
                                ))}
                            </div>
                        </div>

                        <div ref={containerRef} className="relative h-[640px] overflow-auto">
                            {/* 背景グリッド（15分線） */}
                            <div className="relative" style={{ height: 96 * ROW_PX }}>
                                {Array.from({ length: 96 }).map((_, i) => (
                                    <div key={i} className={`${i % 4 === 0 ? "border-t border-gray-200" : "border-t border-gray-100"} absolute left-0 right-0`} style={{ top: i * ROW_PX }} />
                                ))}

                                {/* カード */}
                                {cards.map((c) => (
                                    <ShiftCard key={c.id} card={c} staff={staffSorted} rowIndexById={rowIndexById} onCommit={commitChange} onAutoScroll={autoScroll} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 備考（任意） */}
            <div className="mt-4">
                <Label>備考</Label>
                <Input placeholder="ここにメモを記入できます。" />
            </div>
        </div>
    );
}

// --- 個別カード（ドラッグ&リサイズ） ---
function ShiftCard({ card, staff, rowIndexById, onCommit, onAutoScroll }: {
    card: RosterShiftCard;
    staff: RosterStaff[];
    rowIndexById: Map<string, number>;
    onCommit: (u: Partial<RosterShiftCard> & { id: string }) => void;
    onAutoScroll: (y: number) => void;
}) {
    const startMin = timeToMin(card.start_at);
    const endMin = timeToMin(card.end_at);
    //const top = (Math.floor(startMin / SLOT_MINUTES)) * ROW_PX;
    //const height = Math.max(((endMin - startMin) / SLOT_MINUTES) * ROW_PX, ROW_PX);
    //const startHour = Math.floor(startMin / 60);
    //const leftPct = (startHour / 24) * 100;
    const widthPct = (1 / 24) * 100;

    const ref = React.useRef<HTMLDivElement>(null);
    const [ghost, setGhost] = useState<Partial<RosterShiftCard> | null>(null);

    const sAt = ghost?.start_at || card.start_at; 
    const eAt = ghost?.end_at || card.end_at; 
    //const sId = ghost?.staff_id || card.staff_id;
    const sMin = timeToMin(sAt); const eMin = timeToMin(eAt);
    const topNow = (Math.floor(sMin / SLOT_MINUTES)) * ROW_PX;
    const heightNow = Math.max(((eMin - sMin) / SLOT_MINUTES) * ROW_PX, ROW_PX);
    const startHourNow = Math.floor(sMin / 60);
    const leftPctNow = (startHourNow / 24) * 100;

    function onMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        const el = ref.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        const isLeftHandle = e.clientX - rect.left < 8;
        const isRightHandle = rect.right - e.clientX < 10;
        const mode: "move" | "resizeLeft" | "resizeRight" = isLeftHandle ? "resizeLeft" : isRightHandle ? "resizeRight" : "move";

        const startY = e.clientY; const startX = e.clientX;
        const startStart = startMin; const startEnd = endMin;
        const currentRow = rowIndexById.get(card.staff_id) ?? 0;

        const onMove = (ev: MouseEvent) => {
            onAutoScroll(ev.clientY);
            const dy = ev.clientY - startY; // 1行=15分=ROW_PX
            const dx = ev.clientX - startX; // 横は1h=要素幅

            if (mode === "move") {
                const moveRows = Math.round(dy / ROW_PX);
                const targetRow = clamp(currentRow + moveRows, 0, staff.length - 1);
                const newStaffId = staff[targetRow]?.id || card.staff_id;
                const dxMin = Math.round(dx / rect.width * 60); // 1列=1h
                const newStart = snap(startStart + dxMin);
                const dur = startEnd - startStart;
                const newEnd = clamp(newStart + dur, 0, 24 * 60);
                setGhost({ staff_id: newStaffId, start_at: minToTime(clamp(newStart, 0, 24 * 60)), end_at: minToTime(newEnd) });
            } else if (mode === "resizeLeft") {
                const dxMin = Math.round(dx / rect.width * 60);
                const newStart = clamp(snap(startStart + dxMin), 0, startEnd - SLOT_MINUTES);
                setGhost({ start_at: minToTime(newStart) });
            } else if (mode === "resizeRight") {
                const dxMin = Math.round(dx / rect.width * 60);
                const newEnd = clamp(snap(startEnd + dxMin), startStart + SLOT_MINUTES, 24 * 60);
                setGhost({ end_at: minToTime(newEnd) });
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (ghost) { onCommit({ id: card.id, ...ghost }); setGhost(null); }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    return (
        <div
            ref={ref}
            onMouseDown={onMouseDown}
            role="button"
            title={`${sAt}〜${eAt} ${card.client_name} ${card.service_name}`}
            className="absolute select-none rounded-md shadow-sm text-left px-2 py-1 text-xs leading-tight border bg-blue-500 text-white hover:opacity-90 cursor-grab active:cursor-grabbing"
            style={{ top: topNow, height: heightNow, left: `calc(${leftPctNow}% + 4px)`, width: `calc(${widthPct}% - 8px)` }}
            data-roster-card
        >
            {/* リサイズ当たり判定 */}
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" />
            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" />

            {/* 表示: 開始–終了 / 利用者名 / サービス名 */}
            <div className="flex items-center justify-between">
                <span className="font-semibold truncate">{card.client_name}</span>
            </div>
            <div className="opacity-90">{sAt}〜{eAt}</div>
            <div className="truncate opacity-90">{card.service_name}</div>

            {ghost && (
                <div className="absolute right-1 bottom-1 text-[10px] bg-black/30 px-1 rounded">
                    {sAt}→{eAt}
                </div>
            )}
        </div>
    );
}