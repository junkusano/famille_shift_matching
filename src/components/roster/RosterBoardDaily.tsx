"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { useRouter, useSearchParams } from "next/navigation";

// ===== タイムライン設定 =====
const MINUTES_IN_DAY = 24 * 60;
const SNAP_MIN = 5;                 // 5分刻み
const PX_PER_MIN = 2;               // 1分=2px（横幅）
const ROW_HEIGHT = 56;              // ⑦ 2行表示に合わせて少し高め
const NAME_COL_WIDTH = 108;         // 氏名列は細め
const HEADER_H = 40;                // 時間ヘッダー高さ
const MIN_DURATION_MIN = 10;        // 最小長さ（分）

// ===== ユーティリティ =====
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const snapMin = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN;
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
  grabOffsetMin: number;    // つかんだ横位置（分）
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

  // ====== 表示データ（カードはドラッグ反映のため state に） ======
  const [cards, setCards] = useState<RosterShiftCard[]>(initialView.shifts);

  // チーム（org名）一覧
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    initialView.staff.forEach((st) => st.team && s.add(st.team));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ja"));
  }, [initialView.staff]);

  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(() => allTeams);
  useEffect(() => {
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

  // ====== スクロール制御 ======
  // ⑥ 縦スクロールはページ(main)に委譲 → 右ペインは横スクロールのみ
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // ====== ヘッダーのコンパクト表示 & 氏名列全画面トグル ======
  const [compact, setCompact] = useState(true);
  const [hideNames, setHideNames] = useState(false); // 氏名列を隠す（フルスクリーン）

  // ====== 時間ヘッダーの目盛 ======
  const hours = useMemo(() => {
    const arr: { label: string; left: number }[] = [];
    for (let h = 0; h <= 24; h++) {
      arr.push({ label: `${String(h).padStart(2, "0")}:00`, left: h * 60 * PX_PER_MIN });
    }
    return arr;
  }, []);

  // ====== DnD ======
  const [drag, setDrag] = useState<DragState>(null);

  // 画面全体縦スクロール（端で自動スクロールするとき用）
  const autoScrollWindowIfNearEdge = (clientY: number) => {
    const margin = 40;
    const speed = 24;
    if (clientY < margin) window.scrollBy({ top: -speed, behavior: "auto" });
    else if (clientY > window.innerHeight - margin) window.scrollBy({ top: speed, behavior: "auto" });
  };

  // 右ペイン横座標→分換算
  const minuteFromClientX = (clientX: number) => {
    const sc = rightScrollRef.current;
    if (!sc) return 0;
    const rect = sc.getBoundingClientRect();
    const x = clientX - rect.left + sc.scrollLeft;
    return clamp(x / PX_PER_MIN, 0, MINUTES_IN_DAY);
  };

  // ドラッグ対象行を、開始行からの差分で決定（縦飛び対策）
  const rowIdxFromDeltaY = (deltaY: number, origRowIdx: number) => {
    const dRows = Math.round(deltaY / ROW_HEIGHT);
    return clamp(origRowIdx + dRows, 0, Math.max(0, displayStaff.length - 1));
  };

  // move開始
  const onCardMouseDownMove = (e: React.MouseEvent, card: RosterShiftCard) => {
    e.preventDefault();
    const rowIdx = rowIndexByStaff.get(card.staff_id) ?? 0;
    const s = hhmmToMin(card.start_at);
    const en = hhmmToMin(card.end_at);
    const pointerMin = minuteFromClientX(e.clientX);
    const grabOffsetMin = clamp(pointerMin - s, 0, en - s); // カード内相対位置
    setDrag({
      mode: "move",
      cardId: card.id,
      origStartMin: s,
      origEndMin: en,
      origRowIdx: rowIdx,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      grabOffsetMin,
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
      grabOffsetMin: 0,
      ghostStartMin: s,
      ghostEndMin: en,
      ghostRowIdx: rowIdx,
    });
  };

  // ドラッグ移動（windowにバインド）
  useEffect(() => {
    function onMove(ev: MouseEvent) {
      if (!drag) return;

      if (drag.mode === "move") {
        const pointerMin = minuteFromClientX(ev.clientX);
        const newStartRaw = pointerMin - drag.grabOffsetMin;
        const dur = drag.origEndMin - drag.origStartMin;
        const newStart = snapMin(clamp(newStartRaw, 0, MINUTES_IN_DAY - MIN_DURATION_MIN));
        const newEnd = clamp(newStart + dur, newStart + MIN_DURATION_MIN, MINUTES_IN_DAY);
        const newRowIdx = rowIdxFromDeltaY(ev.clientY - drag.pointerStartY, drag.origRowIdx);
        setDrag((d) =>
          d && { ...d, ghostStartMin: newStart, ghostEndMin: newEnd, ghostRowIdx: newRowIdx }
        );
      } else if (drag.mode === "resizeEnd") {
        const pointerMin = minuteFromClientX(ev.clientX);
        const newEnd = snapMin(
          clamp(pointerMin, drag.origStartMin + MIN_DURATION_MIN, MINUTES_IN_DAY)
        );
        setDrag((d) => d && { ...d, ghostEndMin: newEnd, ghostRowIdx: d.origRowIdx });
      }

      // 横端で自動スクロール（右ペイン）
      const sc = rightScrollRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const margin = 40;
        const speed = 24;
        if (ev.clientX < rect.left + margin) sc.scrollLeft -= speed;
        else if (ev.clientX > rect.right - margin) sc.scrollLeft += speed;
      }

      // 縦端はウィンドウをスクロール
      autoScrollWindowIfNearEdge(ev.clientY);
    }

    function onUp() {
      if (!drag) return;
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
            ? { ...c, id: `${shiftId}_${staff_id}`, staff_id, start_at, end_at }
            : c
        )
      );

      // サーバ PATCH
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
  // ⑥ 高さ固定をやめ、縦スクロールはページ側(main)に任せる
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${hideNames ? 12 : NAME_COL_WIDTH}px 1fr`,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  };
  const leftColStyle: React.CSSProperties = {
    position: "relative",
    borderRight: "1px solid #e5e7eb",
    background: "#fff",
  };
  // 右ペインは横のみスクロール
  const rightColStyle: React.CSSProperties = {
    position: "relative",
    overflowX: "auto",
    overflowY: "hidden",
    background: "#fff",
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
    padding: hideNames ? "0" : "0 8px",
    fontWeight: 600,
    fontSize: 12,
    justifyContent: hideNames ? "center" : "flex-start",
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
  const nameRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: hideNames ? "0 2px" : "0 8px",
    height: ROW_HEIGHT,
    borderBottom: "1px solid #f1f5f9",
    background: "#fff",
    fontSize: 12,
  };
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
      flexDirection: "column",       // ⑦ 2行表示
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "4px 8px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      cursor: "grab",
      userSelect: "none",
      lineHeight: 1.1,
      gap: 2,
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
      {/* ヘッダー（コンパクト+全画面） */}
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
              title="チーム（org）で絞り込み"
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
                  <div className="space-x-2">
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setSelectedTeams(allTeams)}>全選択</button>
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setSelectedTeams([])}>クリア</button>
                  </div>
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

          {/* 氏名列の表示/非表示（フルスクリーン） */}
          <button
            onClick={() => setHideNames((v) => !v)}
            className="px-2 py-1 rounded border hover:bg-gray-50 text-sm"
            title="氏名列の表示/非表示（フルスクリーン）"
          >
            {hideNames ? "氏名列表示" : "氏名列隠す"}
          </button>

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
          チーム絞り込みは「チーム」から。氏名列は「氏名列隠す」でフルスクリーンにできます。
        </div>
      )}

      {/* 盤面（縦スクロールはページ側に任せる） */}
      <div style={gridStyle}>
        {/* 左：氏名列 */}
        <div style={leftColStyle}>
          <div style={headerNameStyle}>
            {hideNames ? (
              <button
                className="text-xs px-1 py-0.5 rounded border"
                onClick={() => setHideNames(false)}
                title="氏名列を表示"
              >
                ▶
              </button>
            ) : (
              <>スタッフ</>
            )}
          </div>
          {!hideNames && (
            <div style={{ position: "relative" }}>
              {displayStaff.map((st) => (
                <div key={st.id} style={nameRowStyle} title={st.name}>
                  <div className="truncate">{st.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右：タイムライン（横スクロールのみ、時間ヘッダー固定） */}
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

          {/* 高さは内容に合わせる（ページが縦スクロール） */}
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
                  // ⑦ 2行表示：時間 ↵ 利用者名：サービス名
                  title={`${c.start_at}-${c.end_at}\n${c.client_name}：${c.service_name}`}
                  onMouseDown={(e) => onCardMouseDownMove(e, c)}
                >
                  <div className="text-[11px] md:text-xs font-semibold">{c.start_at}-{c.end_at}</div>
                  <div className="text-[11px] md:text-xs truncate">
                    {c.client_name}：{c.service_name}
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
