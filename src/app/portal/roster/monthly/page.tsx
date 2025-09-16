'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ShiftRecord from '@/components/shift/ShiftRecord';

// ===== 型 =====
type KaipokeCS = {
  id: string;                 // uuid
  kaipoke_cs_id: string;      // 利用者ID（文字列）
  name: string;               // 氏名
  end_at?: string | null;     // 退会日など
  [k: string]: unknown;
};

type StaffUser = {
  user_id: string;            // スタッフの user_id
  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  email?: string | null;
  [k: string]: unknown;
};

type ShiftRow = {
  shift_id: string;
  kaipoke_cs_id: string;      // 利用者ID
  name: string;               // 利用者名（表示用）
  shift_start_date: string;   // 'YYYY-MM-DD'
  shift_start_time: string;   // 'HH:mm'
  shift_end_time: string;     // 'HH:mm'
  service_code: string;

  staff_01_user_id?: string | null;
  staff_02_user_id?: string | null;
  staff_03_user_id?: string | null;

  staff_02_attend_flg: boolean;
  staff_03_attend_flg: boolean;

  required_staff_count: number;
  two_person_work_flg: boolean;
  judo_ido: string;           // 重度移動
};

// ===== ユーティリティ =====
const ymFmt = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
};

const fullName = (u: StaffUser) => {
  const last = u.last_name_kanji ?? '';
  const first = u.first_name_kanji ?? '';
  const name = `${last} ${first}`.trim();
  return name || u.user_id;
};

// 直近5年(過去60ヶ月)〜先12ヶ月のリスト（現在月を初期値）
const buildMonthList = (now = new Date()) => {
  const list: string[] = [];
  const start = new Date(now);
  start.setMonth(start.getMonth() - 60);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 12);

  const cur = new Date(start);
  while (cur <= end) {
    list.push(ymFmt(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
};

// ===== 本体 =====
export default function MonthlyRosterPage() {
  // 利用者（kaipoke_cs）
  const [clients, setClients] = useState<KaipokeCS[]>([]);
  const [selectedCsId, setSelectedCsId] = useState<string>('');

  // スタッフ（users）
  const [staffs, setStaffs] = useState<StaffUser[]>([]);

  // 月選択
  const monthList = useMemo(() => buildMonthList(new Date()), []);
  const [selectedYm, setSelectedYm] = useState<string>(ymFmt(new Date()));

  // シフト一覧
  const [shifts, setShifts] = useState<ShiftRow[]>([]);

  // 訪問記録モーダル
  const [recordShiftId, setRecordShiftId] = useState<string | null>(null);

  // ---- 取得: 利用者一覧（/api/kaipoke-info）----
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/kaipoke-info', { cache: 'no-store' });
        const j = await r.json();
        const arr: unknown = j;
        const list = Array.isArray(arr) ? arr : [];
        // 退会(end_at)していない or end_atが未来の人を先に
        const active = list
          .filter((x): x is KaipokeCS => !!x && typeof x === 'object' && 'kaipoke_cs_id' in x && 'name' in x)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClients(active);
        if (active.length && !selectedCsId) setSelectedCsId(active[0].kaipoke_cs_id);
      } catch (e) {
        console.error('GET /api/kaipoke-info failed', e);
        setClients([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 取得: スタッフ一覧（/api/users）----
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/users', { cache: 'no-store' });
        const j = await r.json();
        const arr: unknown = j;
        const list = Array.isArray(arr) ? arr : [];
        const ok = list.filter((u): u is StaffUser => !!u && typeof u === 'object' && 'user_id' in u);
        setStaffs(ok);
      } catch (e) {
        console.error('GET /api/users failed', e);
        setStaffs([]);
      }
    })();
  }, []);

  // ---- 取得: シフト（/api/shifts?kaipoke_cs_id=...&month=YYYY-MM）----
  const fetchShifts = async (csId: string, ym: string) => {
    if (!csId || !ym) { setShifts([]); return; }
    try {
      const r = await fetch(`/api/shifts?kaipoke_cs_id=${encodeURIComponent(csId)}&month=${encodeURIComponent(ym)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) {
        console.error('GET /api/shifts error', j?.error || r.status);
        setShifts([]);
        return;
      }
      const arr: unknown = j;
      const list = Array.isArray(arr) ? arr : [];
      // 最低限のバリデーション
      const typed = list.filter((s): s is ShiftRow => !!s && typeof s === 'object' && 'shift_id' in s) as ShiftRow[];
      setShifts(typed);
    } catch (e) {
      console.error('GET /api/shifts failed', e);
      setShifts([]);
    }
  };

  useEffect(() => {
    if (selectedCsId && selectedYm) fetchShifts(selectedCsId, selectedYm);
  }, [selectedCsId, selectedYm]);

  // ---- 保存（行単位）----
  const handleSaveRow = async (row: ShiftRow) => {
    try {
      const res = await fetch('/api/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`保存に失敗: ${j?.error ?? res.status}`);
        return;
      }
      alert('保存しました');
    } catch (e) {
      console.error('PUT /api/shifts failed', e);
      alert('保存時にエラーが発生しました');
    }
  };

  // ---- スタッフ options ----
  const staffOptions = useMemo(() => {
    return staffs.map(s => ({ value: s.user_id, label: fullName(s) }));
  }, [staffs]);

  // ---- UI ----
  return (
    <div className="p-3 space-y-3">
      {/* フィルタ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 利用者 */}
        <div>
          <label htmlFor="clientSelect" className="block text-xs font-medium mb-1">利用者</label>
          <select
            id="clientSelect"
            className="w-full max-w-[320px] border rounded px-2 py-1 text-sm"
            value={selectedCsId}
            onChange={(e) => setSelectedCsId(e.target.value)}
          >
            {clients.map(c => (
              <option key={c.kaipoke_cs_id} value={c.kaipoke_cs_id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* 年月 */}
        <div>
          <label htmlFor="ymSelect" className="block text-xs font-medium mb-1">実施月</label>
          <select
            id="ymSelect"
            className="w-full max-w-[180px] border rounded px-2 py-1 text-sm"
            value={selectedYm}
            onChange={(e) => setSelectedYm(e.target.value)}
          >
            {monthList.map(m => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse">
          <thead>
            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 text-left text-sm bg-gray-50">
              <th>利用者名</th>
              <th>Shift ID</th>
              <th>サービス</th>
              <th>必要人数</th>
              <th>二人作業</th>
              <th>重度移動</th>
              <th>スタッフ 1</th>
              <th>スタッフ 2</th>
              <th>同行2</th>
              <th>スタッフ 3</th>
              <th>同行3</th>
              <th>保存</th>
              <th>訪問記録</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.shift_id} className="[&>td]:border-b [&>td]:px-2 [&>td]:py-2 align-top text-sm">
                <td>{s.name}</td>
                <td className="font-mono">{s.shift_id}</td>
                <td>{s.service_code}</td>

                {/* 必要人数 */}
                <td>
                  <input
                    type="number"
                    min={1}
                    className="w-16 border rounded px-1 py-0.5"
                    value={s.required_staff_count}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, required_staff_count: v } as ShiftRow : x));
                    }}
                  />
                </td>

                {/* 二人作業 */}
                <td>
                  <input
                    type="checkbox"
                    checked={!!s.two_person_work_flg}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, two_person_work_flg: v } as ShiftRow : x));
                    }}
                  />
                </td>

                {/* 重度移動 */}
                <td>
                  <input
                    type="text"
                    className="w-24 border rounded px-1 py-0.5"
                    value={s.judo_ido ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, judo_ido: v } as ShiftRow : x));
                    }}
                  />
                </td>

                {/* スタッフ1 */}
                <td>
                  <select
                    className="min-w-[180px] border rounded px-2 py-1"
                    value={s.staff_01_user_id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, staff_01_user_id: v } as ShiftRow : x));
                    }}
                  >
                    <option value="">— 選択 —</option>
                    {staffOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>

                {/* スタッフ2 + 同行 */}
                <td>
                  <select
                    className="min-w-[180px] border rounded px-2 py-1"
                    value={s.staff_02_user_id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, staff_02_user_id: v } as ShiftRow : x));
                    }}
                  >
                    <option value="">— 選択 —</option>
                    {staffOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!s.staff_02_attend_flg}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, staff_02_attend_flg: v } as ShiftRow : x));
                    }}
                  />
                </td>

                {/* スタッフ3 + 同行 */}
                <td>
                  <select
                    className="min-w-[180px] border rounded px-2 py-1"
                    value={s.staff_03_user_id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, staff_03_user_id: v } as ShiftRow : x));
                    }}
                  >
                    <option value="">— 選択 —</option>
                    {staffOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!s.staff_03_attend_flg}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setShifts(prev => prev.map(x => x.shift_id === s.shift_id ? { ...x, staff_03_attend_flg: v } as ShiftRow : x));
                    }}
                  />
                </td>

                {/* 保存 */}
                <td>
                  <button
                    type="button"
                    className="px-3 py-1 border rounded"
                    onClick={() => handleSaveRow(s)}
                  >
                    保存
                  </button>
                </td>

                {/* 訪問記録（ShiftRecordモーダル） */}
                <td>
                  <button
                    type="button"
                    className="px-3 py-1 border rounded"
                    onClick={() => setRecordShiftId(s.shift_id)}
                  >
                    訪問記録
                  </button>
                </td>
              </tr>
            ))}

            {shifts.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center text-sm text-gray-500 py-8">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* モーダル（超シンプル） */}
      {recordShiftId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRecordShiftId(null)}
        >
          <div
            className="bg-white rounded-xl w-[min(1100px,96vw)] max-h-[90vh] overflow-auto p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">訪問記録</h2>
              <button className="px-2 py-1 border rounded" onClick={() => setRecordShiftId(null)}>閉じる</button>
            </div>
            {/* ShiftRecord をそのまま描画 */}
            <ShiftRecord shiftId={recordShiftId} />
          </div>
        </div>
      )}
    </div>
  );
}
