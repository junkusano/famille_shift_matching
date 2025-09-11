//components/roster/RosterBoardDaily.tsx

"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { useRouter, useSearchParams } from "next/navigation";

// ====== タイムライン設定 ======
const MINUTES_IN_DAY = 24 * 60;
const PX_PER_MIN = 2; // 横スケール（1分=2px => 2880px 幅）

// 時刻 "HH:mm" → 分
function hhmmToMin(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function durationMin(start: string, end: string): number {
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  return Math.max(0, e - s);
}
function leftPx(start: string): number {
  return Math.max(0, Math.min(hhmmToMin(start), MINUTES_IN_DAY) * PX_PER_MIN);
}
function widthPx(start: string, end: string): number {
  const w = durationMin(start, end) * PX_PER_MIN;
  return Math.max(2, w); // 最低幅
}

// ====== レベル表示の読み替えセット（必要に応じて編集） ======
const LEVEL_LABEL_SETS: Record<string, Record<string, string>> = {
  numeric: {}, // そのまま表示（"1"→"1"）
  role: {
    "1": "新人",
    "2": "初級",
    "3": "中級",
    "4": "上級",
    "5": "リーダー",
  },
};
type LevelLabelKey = keyof typeof LEVEL_LABEL_SETS;

// ====== Props ======
type Props = {
  date: string;
  initialView: RosterDailyView;
};

export default function RosterBoardDaily({ date, initialView }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ====== フィルタ：チームのみ（複数選択） ======
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    initialView.staff.forEach((st) => {
      if (st.team) s.add(st.team);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ja"));
  }, [initialView.staff]);

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [levelLabelKey, setLevelLabelKey] = useState<LevelLabelKey>("numeric");

  // 初期は全チームを選択（空配列だと“全表示”扱いでも良いが、明示的に選ぶ）
  useEffect(() => {
    setSelectedTeams(allTeams);
  }, [allTeams]);

  // ====== スタッフ並び：チーム → レベル数字 → 氏名 ======
  const displayStaff: RosterStaff[] = useMemo(() => {
    const sorted = [...initialView.staff].sort((a, b) => {
      const ta = a.team ?? "";
      const tb = b.team ?? "";
      if (ta !== tb) return ta.localeCompare(tb, "ja");

      const la = Number.isFinite(Number(a.level)) ? Number(a.level) : Number.MAX_SAFE_INTEGER;
      const lb = Number.isFinite(Number(b.level)) ? Number(b.level) : Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;

      return a.name.localeCompare(b.name, "ja");
    });

    // チームフィルタ
    if (!selectedTeams.length) return sorted;
    return sorted.filter((st) => (st.team ? selectedTeams.includes(st.team) : false));
  }, [initialView.staff, selectedTeams]);

  // ====== スタッフ行インデックス（カード配置に使用） ======
  const rowIndexByStaff = useMemo(() => {
    const map = new Map<string, number>();
    displayStaff.forEach((st, idx) => map.set(st.id, idx));
    return map;
  }, [displayStaff]);

  // ====== 当日カード（複数担当は既に複製済の前提） ======
  const dayCards = initialView.shifts;

  // ====== 横・縦スクロールコンテナ ======
  const scrollRef = useRef<HTMLDivElement>(null);

  // ====== 時間ヘッダーの目盛 ======
  const hours = useMemo(() => {
    const arr: { label: string; left: number }[] = [];
    for (let h = 0; h <= 24; h++) {
      const hh = String(h).padStart(2, "0");
      arr.push({ label: `${hh}:00`, left: h * 60 * PX_PER_MIN });
    }
    return arr;
  }, []);

  // ====== 日付ナビ ======
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

  // ====== オートスクロール（ドラッグ中でも）簡易版 ======
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onMove(ev: MouseEvent) {
      const rect = el.getBoundingClientRect();
      const margin = 40;
      const speed = 20;
      if (ev.clientX < rect.left + margin) el.scrollLeft -= speed;
      else if (ev.clientX > rect.right - margin) el.scrollLeft += speed;
      if (ev.clientY < rect.top + margin) el.scrollTop -= speed;
      else if (ev.clientY > rect.bottom - margin) el.scrollTop += speed;
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ====== スタイル ======
  const ROW_HEIGHT = 48; // 1行の高さ
  const NAME_COL_WIDTH = 260;
  const TIMELINE_WIDTH = MINUTES_IN_DAY * PX_PER_MIN;

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${NAME_COL_WIDTH}px 1fr`,
    height: "calc(100vh - 160px)", // だいたい上部ナビを除いた高さ
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  };

  const leftColStyle: React.CSSProperties = {
    position: "relative",
    borderRight: "1px solid #e5e7eb",
    overflow: "hidden", // 左は横スクロールしない
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
    height: 40,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    fontWeight: 600,
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
    height: 40,
    minWidth: TIMELINE_WIDTH,
  };

  const timeGridStyle: React.CSSProperties = {
    position: "relative",
    minWidth: TIMELINE_WIDTH,
    background:
      "repeating-linear-gradient(to right, #f3f4f6 0, #f3f4f6 1px, transparent 1px, transparent 120px)", // 1時間ごとに薄い線（2px/分→120px/時）
  };

  const staffRowStyle = (rowIdx: number): React.CSSProperties => ({
    position: "absolute",
    top: rowIdx * ROW_HEIGHT,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottom: "1px solid #f1f5f9",
  });

  const nameRowStyle = (rowIdx: number): React.CSSProperties => ({
    position: "absolute",
    top: rowIdx * ROW_HEIGHT + 40, // タイムヘッダー分オフセット
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fff",
    zIndex: 1,
  });

  const boardHeight = 40 + displayStaff.length * ROW_HEIGHT;

  const cardStyle = (c: RosterShiftCard): React.CSSProperties => {
    const topIdx = rowIndexByStaff.get(c.staff_id);
    const topPx = topIdx != null ? 40 + topIdx * ROW_HEIGHT + 4 : 40;
    return {
      position: "absolute",
      top: topPx,
      left: leftPx(c.start_at),
      width: widthPx(c.start_at, c.end_at),
      height: ROW_HEIGHT - 8,
      borderRadius: 6,
      background: "#DBEAFE", // 青系（保険内/外の区別をしない仕様）
      border: "1px solid #93C5FD",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    };
  };

  // ====== レベル表示の読み替え ======
  const levelLabelOf = (lvl?: string | null): string | null => {
    if (!lvl) return null;
    const set = LEVEL_LABEL_SETS[levelLabelKey] || {};
    return set[lvl] ?? lvl; // 無ければそのまま
  };

  // ====== UI ======
  return (
    <div className="p-3 space-y-3">
      {/* 上部ナビ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="px-2 py-1 rounded border hover:bg-gray-50">前日</button>
          <input
            type="date"
            className="px-2 py-1 rounded border"
            value={date}
            onChange={onPickDate}
          />
          <button onClick={nextDay} className="px-2 py-1 rounded border hover:bg-gray-50">翌日</button>
        </div>

        {/* フィルター：チーム（複数選択） */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">チーム</label>
          <select
            multiple
            size={Math.min(6, Math.max(2, allTeams.length))}
            value={selectedTeams}
            onChange={(e) =>
              setSelectedTeams(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
            className="min-w-48 px-2 py-1 rounded border"
          >
            {allTeams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* レベル表示の読み替え（フィルターではない） */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">レベル表示</label>
          <select
            value={levelLabelKey}
            onChange={(e) => setLevelLabelKey(e.target.value as LevelLabelKey)}
            className="px-2 py-1 rounded border"
          >
            <option value="numeric">数字</option>
            <option value="role">役割（新人/中級…）</option>
          </select>
        </div>
      </div>

      {/* 盤面 */}
      <div style={gridStyle}>
        {/* 左：氏名列（固定） */}
        <div style={leftColStyle}>
          <div style={headerNameStyle}>スタッフ</div>
          <div
            style={{
              position: "relative",
              height: boardHeight,
            }}
          >
            {displayStaff.map((st, idx) => (
              <div key={st.id} style={nameRowStyle(idx)} title={st.name}>
                <div className="truncate">
                  {st.team ? `[${st.team}] ` : ""}
                  {st.name}
                  {st.level ? `（Lv:${levelLabelOf(st.level)}）` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右：タイムライン（横・縦スクロール、上部は時間ヘッダー固定） */}
        <div style={rightColStyle} ref={scrollRef}>
          <div style={headerTimeWrap}>
            <div style={timeTicksStyle}>
              {hours.map((h) => (
                <div
                  key={h.label}
                  style={{
                    position: "absolute",
                    left: h.left,
                    top: 0,
                    height: 40,
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

          <div
            style={{
              position: "relative",
              minWidth: TIMELINE_WIDTH,
              height: boardHeight,
            }}
          >
            {/* 背景グリッド（1時間線） */}
            <div style={{ ...timeGridStyle, position: "absolute", inset: 0 }} />

            {/* 行の下線 */}
            {displayStaff.map((st, idx) => (
              <div key={st.id} style={staffRowStyle(idx)} />
            ))}

            {/* カード配置 */}
            {dayCards.map((c) => {
              const rowIdx = rowIndexByStaff.get(c.staff_id);
              if (rowIdx == null) return null; // フィルタで非表示のスタッフ
              return (
                <div key={c.id} style={cardStyle(c)} title={`${c.client_name} / ${c.service_code} ${c.start_at}-${c.end_at}`}>
                  <div className="truncate text-sm">
                    <span className="font-semibold">{c.start_at}-{c.end_at}</span>{" "}
                    {c.client_name} / {c.service_code}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
