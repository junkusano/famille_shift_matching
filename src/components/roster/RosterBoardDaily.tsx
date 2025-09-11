//components/roster/RosterBoardDaily.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { useRouter, useSearchParams } from "next/navigation";

// ===== タイムライン設定 =====
const MINUTES_IN_DAY = 24 * 60;
const PX_PER_MIN = 2;               // 1分=2px（横幅） => 1日=2880px
const ROW_HEIGHT = 44;              // 1行高さ（すこし詰める）
const NAME_COL_WIDTH = 160;         // 氏名列 幅を小さく
const HEADER_H = 40;                // 時間ヘッダー高さ
const MIN_DURATION_MIN = 10;        // 最小長さ（分）

// ===== ユーティリティ =====
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const toHHmm = (m: number) => {
  const mm = clamp(Math.round(m), 0, MINUTES_IN_DAY);
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};
const hhmmToMin = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};
const leftPx = (start: string) => clamp(hhmmToMin(start), 0, MINUTES_IN_DAY) * PX_PER_MIN;
const widthPx = (start: string, end: string) => {
  const w = clamp(hhmmToMin(end) - hhmmToMin(start), MIN_DURATION_MIN, MINUTES_IN_DAY) * PX_PER_MIN;
  return Math.max(2, w);
};
const TIMELINE_WIDTH = MINUTES_IN_DAY * PX_PER_MIN;

// "12345_9999" -> { shiftId: 12345, staffId: "9999" }
function parseCardCompositeId(id: string) {
  const idx = id.lastIndexOf("_");
  if (idx < 0) return { shiftId: Number(id), staffId: "" };
  return { shiftId: Number(id.slice(0, idx)), staffId: id.slice(idx + 1) };
}

// ===== Props =====
type Props = {
  date: string;
  initialView: RosterDailyView;
};

// ===== DnD State =====
type DragMode = "move" | "resizeEnd";
type DragState = null | {
  mode: DragMode;
  cardId: string;
  // 固定情報
  origStartMin: number;
  origEndMin: number;
  origRowIdx: number;
  pointerStartX: number;
  pointerStartY: number;
  // ゴースト（可変）
  ghostStartMin: number;
  ghostEndMin: number;
  ghostRowIdx: number;
};

export default function RosterBoardDaily({ date, initialView }: Props) {
  // ====== ルーティング（日付遷移） ======
  const router = useRouter();
  const searchParams = useSearchParams();
  const go = (d: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("date", d);
    router.push(`/portal/roster/daily?${params.toString()}`);
  };
  const toJstYYYYMMDD = (dt: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dt);
  const prevDay = () => {
    const base = new Date(`${date}T00:00:00+09:00`);
    base.setDate(base.getDate() - 1);
    go(toJstYYYYMMDD(base));
  };
  const nextDay = () => {
    const base = new Date(`${date}T00:00:00+09:00`);
    base.setDate(base.getDate() + 1);
    go(toJstYYYYMMDD(base));
  };
  const onPickDate: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (e.target.value) go(e.target.value);
  };

  // ====== 表示データ（ローカル状態：カードはドラッグ反映のため state に） ======
  const [cards, setCards] = useState<RosterShiftCard[]>(initialView.shifts);

  // チーム（org_unit）一覧・フィルタ（ポップアップ内）
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    initialView.staff.forEach((st) => st.team && s.add(st.team));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ja"));
  }, [initialView.staff]);

  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(() => allTeams);

  useEffect(() => {
    // 初回・リスト変更時に全選択
    setSelectedTeams(allTeams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTeams.join("|")]);

  // 並び順：チーム→レベル数値→氏名
  const displayStaff: RosterStaff[] = useMemo(() => {
    const sorted = [...initialView.staff].sort((a, b) => {
      const ta = a.team ?? "", tb = b.team ?? "";
      if (ta !== tb) return ta.localeCompare(tb, "ja");
      const la = Number.isFinite(Number(a.level)) ? Number(a.level) : Number.MAX_SAFE_INTEGER;
      const lb = Number.isFinite(Number(b.level)) ? Number(b.level) : Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name, "ja");
    });
    if (!selectedTeams.length) return sorted;
    return sorted.filter((st) => (st.team ? selectedTeams.includes(st.team) : false));
  }, [initialView.staff, selectedTeams]);

  const rowIndexByStaff = useMemo(() => {
    const m = new Map<string, number>();
    displayStaff.forEach((st, i) => m.set(st.id, i));
    return m;
  }, [displayStaff]);

  // ====== スクロール同期（右⇔左） ======
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const leftSyncRef = useRef<HTMLDivElement>(null); // 左側の行コンテナ（transformで追従）
  useEffect(() => {
    const el = rightScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      if (leftSyncRef.current) {
        leftSyncRef.current.style.transform = `translateY(${-y}px)`;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ====== ヘッダーのコンパクト表示 ======
  const [compact, setCompact] = useState(true); // 省スペースに（デフォルト: true）

  // ====== 時間ヘッダーの目盛 ======
  const hours = useMemo(() => {
    const arr: { label: string; left: number }[] = [];
    for (let h = 0; h <= 24; h++) {
      arr.push({ label: `${String(h).padStart(2, "0")}:00`, left: h * 60 * PX_PER_MIN });
    }
    return arr;
  }, []);

  // ====== DnD（ドラッグ＆リサイズ） ======
  const [drag, setDrag] = useState<DragState>(null);

  // 右ペイン上の Y から rowIdx を計算
  const rowIdxFromClientY = (clientY: number) => {
    const sc = rightScrollRef.current;
    if (!sc) return 0;
    const rect = sc.getBoundingClientRect();
    const y = clientY - rect.top + sc.scrollTop - HEADER_H; // ヘッダー分差し引き
    return clamp(Math.floor(y / ROW_HEIGHT), 0, Math.max(0, displayStaff.length - 1));
    // clamp に max0 を入れると displayStaff=0 のときも 0 を返す
  };

  // X から分換算
  const minuteFromClientX = (clientX: number) => {
    const sc = rightScrollRef.current;
    if (!sc) return 0;
    const rect = sc.getBoundingClientRect();
    const x = clientX - rect.left + sc.scrollLeft;
    return clamp(x / PX_PER_MIN, 0, MINUTES_IN_DAY);
  };

  // move開始
  const onCardMouseDownMove = (e: React.MouseEvent, card: RosterShiftCard) => {
    e.preventDefault();
    const rowIdx = rowIndexByStaff.get(card.staff_id) ?? 0;
    const s = hhmmToMin(card.start_at);
    const en = hhmmToMin(card.end_at);
    setDrag({
      mode: "move",
      cardId: card.id,
      origStartMin: s,
      origEndMin: en,
      origRowIdx: rowIdx,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      ghostStartMin: s,
      ghostEndMin: en,
      ghostRowIdx: rowIdx,
    });
  };

  // 右端リサイズ開始
  const onCardMouseDownResizeEnd = (e: React.MouseEvent, card: RosterShiftCard) => {
    e.preventDefault();
    e.stopPropagation();
    const rowIdx = rowIndexByStaff.get(card.staff_id) ?? 0;
    const s = hhmmToMin(card.start_at);
    const en = hhmmToMin(card.end_at);
    setDrag({
      mode: "resizeEnd",
      cardId: card.id,
      origStartMin: s,
      origEndMin: en,
      origRowIdx: rowIdx,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      ghostStartMin: s,
      ghostEndMin: en,
      ghostRowIdx: rowIdx,
    });
  };

  // ドラッグ移動（windowにバインド）
  useEffect(() => {
    function onMove(ev: MouseEvent) {
      if (!drag) return;
      const min = minuteFromClientX(ev.clientX);
      const rowIdx = rowIdxFromClientY(ev.clientY);

      if (drag.mode === "move") {
        const dur = drag.origEndMin - drag.origStartMin;
        const newStart = clamp(min, 0, MINUTES_IN_DAY - MIN_DURATION_MIN);
        const newEnd = clamp(newStart + dur, newStart + MIN_DURATION_MIN, MINUTES_IN_DAY);
        setDrag((d) =>
          d && {
            ...d,
            ghostStartMin: newStart,
            ghostEndMin: newEnd,
            ghostRowIdx: rowIdx,
          }
        );
      } else if (drag.mode === "resizeEnd") {
        const newEnd = clamp(min, drag.origStartMin + MIN_DURATION_MIN, MINUTES_IN_DAY);
        setDrag((d) =>
          d && {
            ...d,
            ghostEndMin: newEnd,
            ghostRowIdx: rowIdx, // リサイズ中の縦移動で担当変更したくないなら固定でもOK
          }
        );
      }

      // 端で自動スクロール
      const sc = rightScrollRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const margin = 40;
        const speed = 24;
        if (ev.clientX < rect.left + margin) sc.scrollLeft -= speed;
        else if (ev.clientX > rect.right - margin) sc.scrollLeft += speed;
        if (ev.clientY < rect.top + margin) sc.scrollTop -= speed;
        else if (ev.clientY > rect.bottom - margin) sc.scrollTop += speed;
      }
    }
    function onUp() {
      if (!drag) return;
      // ドロップ確定
      const { cardId, ghostStartMin, ghostEndMin, ghostRowIdx } = drag;
      const { shiftId } = parseCardCompositeId(cardId);
      const targetStaff = displayStaff[ghostRowIdx];
      if (!targetStaff) {
        setDrag(null);
        return;
      }
      const start_at = toHHmm(ghostStartMin);
      const end_at = toHHmm(ghostEndMin);
      const staff_id = targetStaff.id;

      // 楽観的反映
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? {
                ...c,
                id: `${shiftId}_${staff_id}`,
                staff_id,
                start_at,
                end_at,
              }
            : c
        )
      );

      // サーバ PATCH（失敗時はロールバックしても良い。ここではログのみ）
      (async () => {
        try {
          await fetch(`/api/roster/shifts/${shiftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ staff_id, start_at, end_at, date }),
          });
        } catch (err) {
          console.error("[PATCH] roster shift update failed", err);
        }
      })();

      setDrag(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, displayStaff]);

  // ====== スタイル ======
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${NAME_COL_WIDTH}px 1fr`,
    height: "calc(100vh - 120px)", // ヘッダーをだいぶ詰める
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  };
  const leftColStyle: React.CSSProperties = {
    position: "relative",
    borderRight: "1px solid #e5e7eb",
    overflow: "hidden", // 左はスクロールバーを出さず、transformで同期
  };
  const rightColStyle: React.CSSProperties = {
    position: "relative",
    overflow: "auto", // 横・縦スクロール
  };
  const headerNameStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    height: HEADER_H,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    fontWeight: 600,
    fontSize: 13,
  };
  const headerTimeWrap: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
  };
  const timeTicksStyle: React.CSSProperties = {
    position: "relative",
    height: HEADER_H,
    minWidth: TIMELINE_WIDTH,
  };
  const timeGridStyle: React.CSSProperties = {
    position: "relative",
    minWidth: TIMELINE_WIDTH,
    background:
      "repeating-linear-gradient(to right, #f3f4f6 0, #f3f4f6 1px, transparent 1px, transparent 120px)",
  };
  const nameRowStyle = (rowIdx: number): React.CSSProperties => ({
    position: "absolute",
    top: HEADER_H + rowIdx * ROW_HEIGHT,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fff",
    zIndex: 1,
    fontSize: 13,
  });
  const boardHeight = HEADER_H + displayStaff.length * ROW_HEIGHT;
  const staffRowBgStyle = (rowIdx: number): React.CSSProperties => ({
    position: "absolute",
    top: rowIdx * ROW_HEIGHT,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottom: "1px solid #f1f5f9",
  });
  const cardStyle = (c: RosterShiftCard): React.CSSProperties => {
    const rowIdx = rowIndexByStaff.get(c.staff_id);
    const topPx = rowIdx != null ? HEADER_H + rowIdx * ROW_HEIGHT + 4 : HEADER_H + 4;
    return {
      position: "absolute",
      top: topPx,
      left: leftPx(c.start_at),
      width: widthPx(c.start_at, c.end_at),
      height: ROW_HEIGHT - 8,
      borderRadius: 6,
      background: "#DBEAFE",
      border: "1px solid #93C5FD",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      cursor: "grab",
      userSelect: "none",
    };
  };
  const resizeHandleStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    width: 6,
    height: "100%",
    cursor: "e-resize",
    background: "rgba(0,0,0,0.08)",
  };
  const ghostStyle = (d: Exclude<DragState, null>): React.CSSProperties => ({
    position: "absolute",
    top: HEADER_H + d.ghostRowIdx * ROW_HEIGHT + 4,
    left: d.ghostStartMin * PX_PER_MIN,
    width: (d.ghostEndMin - d.ghostStartMin) * PX_PER_MIN,
    height: ROW_HEIGHT - 8,
    borderRadius: 6,
    background: "rgba(147,197,253,0.35)",
    border: "1px dashed #60A5FA",
    pointerEvents: "none",
    zIndex: 4,
  });

  // ====== UI ======
  return (
    <div className="p-2 space-y-2">
      {/* ヘッダー（コンパクト化可能） */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="px-2 py-1 rounded border hover:bg-gray-50 text-sm">前日</button>
          <input type="date" className="px-2 py-1 rounded border text-sm" value={date} onChange={onPickDate} />
          <button onClick={nextDay} className="px-2 py-1 rounded border hover:bg-gray-50 text-sm">翌日</button>
        </div>

        <div className="flex items-center gap-2">
          {/* チームフィルタ（ポップアップ） */}
          <div className="relative">
            <button
              onClick={() => setTeamFilterOpen((v) => !v)}
              className="px-2 py-1 rounded border hover:bg-gray-50 text-sm"
              title="チームで絞り込み"
            >
              チーム
            </button>
            {teamFilterOpen && (
              <div
                className="absolute right-0 mt-1 w-56 max-h-72 overflow-auto rounded-md border bg-white shadow-lg z-50 p-2"
                onMouseLeave={() => setTeamFilterOpen(false)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">チームで絞り込み</span>
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setSelectedTeams(allTeams)}
                  >
                    全選択
                  </button>
                </div>
                <div className="space-y-1">
                  {allTeams.map((t) => {
                    const checked = selectedTeams.includes(t);
                    return (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedTeams((prev) =>
                              e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                            )
                          }
                        />
                        <span className="truncate" title={t}>{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* コンパクト切替 */}
          <button
            onClick={() => setCompact((v) => !v)}
            className="px-2 py-1 rounded border hover:bg-gray-50 text-sm"
            title="ヘッダーの表示を切替"
          >
            {compact ? "▼" : "▲"}
          </button>
        </div>
      </div>

      {!compact && (
        <div className="text-xs text-gray-500 -mt-1 mb-1">
          表示幅を確保するため、メニューは折りたたみ可能です。チーム絞り込みは「チーム」ボタンから。
        </div>
      )}

      {/* 盤面 */}
      <div style={gridStyle}>
        {/* 左：氏名列（縦スクロールは transform で同期） */}
        <div style={leftColStyle}>
          <div style={headerNameStyle}>スタッフ</div>
          <div
            ref={leftSyncRef}
            style={{ position: "relative", height: boardHeight }}
          >
            {displayStaff.map((st, idx) => (
              <div key={st.id} style={nameRowStyle(idx)} title={st.name}>
                <div className="truncate">{st.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右：タイムライン（横・縦スクロール、時間ヘッダー固定） */}
        <div style={rightColStyle} ref={rightScrollRef}>
          <div style={headerTimeWrap}>
            <div style={timeTicksStyle}>
              {hours.map((h) => (
                <div
                  key={h.label}
                  style={{
                    position: "absolute",
                    left: h.left,
                    top: 0,
                    height: HEADER_H,
                    width: 1,
                    background: "#e5e7eb",
                  }}
                />
              ))}
              {hours.map((h) => (
                <div
                  key={`${h.label}-text`}
                  style={{
                    position: "absolute",
                    left: h.left + 4,
                    top: 10,
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  {h.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "relative", minWidth: TIMELINE_WIDTH, height: boardHeight }}>
            {/* 背景グリッド */}
            <div style={{ ...timeGridStyle, position: "absolute", inset: 0 }} />

            {/* 行罫線 */}
            {displayStaff.map((_, idx) => (
              <div key={idx} style={staffRowBgStyle(idx)} />
            ))}

            {/* カード */}
            {cards.map((c) => {
              const rowIdx = rowIndexByStaff.get(c.staff_id);
              if (rowIdx == null) return null; // チーム絞り込みで非表示のスタッフ
              return (
                <div
                  key={c.id}
                  style={cardStyle(c)}
                  title={`${c.start_at}-${c.end_at} ${c.client_name} / ${c.service_code}`}
                  onMouseDown={(e) => onCardMouseDownMove(e, c)}
                >
                  <div className="truncate text-xs md:text-sm">
                    <span className="font-semibold">{c.start_at}-{c.end_at}</span>{" "}
                    {c.client_name} / {c.service_code}
                  </div>
                  <div
                    style={resizeHandleStyle}
                    onMouseDown={(e) => onCardMouseDownResizeEnd(e, c)}
                  />
                </div>
              );
            })}

            {/* ゴースト */}
            {drag && <div style={ghostStyle(drag)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
