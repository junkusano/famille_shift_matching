//components/roster/ShiftDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RosterShiftDialogData, RosterStaff } from '@/types/roster';

type Props = {
  open: boolean;
  onClose: () => void;
  shift: RosterShiftDialogData | null;
  staffOptions: RosterStaff[];
  onSaved?: (next: RosterShiftDialogData) => void;
};

type FormState = {
  shift_id: number | null;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string;
  staff_01_user_id: string;
  staff_02_user_id: string;
  staff_03_user_id: string;
  staff_02_attend_flg: boolean;
  staff_03_attend_flg: boolean;
  required_staff_count: string;
  two_person_work_flg: boolean;
  judo_ido: string;
  cs_note: string;
};

const emptyForm: FormState = {
  shift_id: null,
  shift_start_date: '',
  shift_start_time: '',
  shift_end_time: '',
  service_code: '',
  staff_01_user_id: '',
  staff_02_user_id: '',
  staff_03_user_id: '',
  staff_02_attend_flg: false,
  staff_03_attend_flg: false,
  required_staff_count: '1',
  two_person_work_flg: false,
  judo_ido: '',
  cs_note: '',
};

export default function ShiftDialog({
  open,
  onClose,
  shift,
  staffOptions,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [doneMsg, setDoneMsg] = useState('');

  useEffect(() => {
    if (!open || !shift) return;
    setErrorMsg('');
    setDoneMsg('');
    setForm({
      shift_id: shift.shift_id,
      shift_start_date: shift.shift_date ?? '',
      shift_start_time: shift.start_at ?? '',
      shift_end_time: shift.end_at ?? '',
      service_code: shift.service_code ?? '',
      staff_01_user_id: String(shift.staff_id_1 ?? ''),
      staff_02_user_id: String(shift.staff_id_2 ?? ''),
      staff_03_user_id: String(shift.staff_id_3 ?? ''),
      staff_02_attend_flg: Boolean(shift.staff_02_attend_flg),
      staff_03_attend_flg: Boolean(shift.staff_03_attend_flg),
      required_staff_count: String(shift.required_staff_count ?? 1),
      two_person_work_flg: Boolean(shift.two_person_work_flg),
      judo_ido: shift.judo_ido ?? '',
      cs_note: shift.cs_note ?? '',
    });
  }, [open, shift]);

  const monthlyHref = useMemo(() => {
    if (!shift?.kaipoke_cs_id || !shift?.shift_date) return '/portal/roster/monthly';
    const month = String(shift.shift_date).slice(0, 7);
    return `/portal/roster/monthly?kaipoke_cs_id=${encodeURIComponent(
      String(shift.kaipoke_cs_id)
    )}&month=${encodeURIComponent(month)}`;
  }, [shift]);

  const clientDetailHref = useMemo(() => {
    if (!shift?.kaipoke_cs_id) return '#';
    return `/portal/kaipoke-info?kaipoke_cs_id=${encodeURIComponent(String(shift.kaipoke_cs_id))}`;
  }, [shift]);

  if (!open || !shift) return null;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveShiftOnly = async () => {
    if (!form.shift_id) {
      setErrorMsg('shift_id がありません');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setDoneMsg('');

    try {
      const res = await fetch('/api/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: form.shift_id,
          shift_start_date: form.shift_start_date,
          shift_start_time: form.shift_start_time,
          shift_end_time: form.shift_end_time,
          service_code: form.service_code,
          staff_01_user_id: form.staff_01_user_id || null,
          staff_02_user_id: form.staff_02_user_id || null,
          staff_03_user_id: form.staff_03_user_id || null,
          staff_02_attend_flg: form.staff_02_attend_flg,
          staff_03_attend_flg: form.staff_03_attend_flg,
          required_staff_count: Number(form.required_staff_count || 1),
          two_person_work_flg: form.two_person_work_flg,
          judo_ido: form.judo_ido || null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error?.message ?? json?.error ?? '保存に失敗しました');
      }

      const next: RosterShiftDialogData = {
        ...shift,
        shift_id: form.shift_id,
        shift_date: form.shift_start_date,
        start_at: form.shift_start_time,
        end_at: form.shift_end_time,
        service_code: form.service_code,
        staff_id_1: form.staff_01_user_id || null,
        staff_id_2: form.staff_02_user_id || null,
        staff_id_3: form.staff_03_user_id || null,
        staff_02_attend_flg: form.staff_02_attend_flg,
        staff_03_attend_flg: form.staff_03_attend_flg,
        required_staff_count: Number(form.required_staff_count || 1),
        two_person_work_flg: form.two_person_work_flg,
        judo_ido: form.judo_ido || null,
        cs_note: form.cs_note,
      };

      onSaved?.(next);
      setDoneMsg('保存しました');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4">
      <div className="mx-auto max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">シフト簡易編集</div>
            <div className="text-sm text-gray-500">
              クリック時の追加API取得はしていません
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1"
          >
            閉じる
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="space-y-3 rounded-lg border p-3">
            <div className="font-semibold">利用者情報</div>

            <div>
              <div className="text-xs text-gray-500">利用者名</div>
              <div>{shift.client_name}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500">住所</div>
              <div className="break-all">{shift.address || '—'}</div>
              {shift.map_url ? (
                <a
                  href={shift.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline"
                >
                  地図を開く
                </a>
              ) : null}
            </div>

            <div>
              <div className="text-xs text-gray-500">備考</div>
              <textarea
                value={form.cs_note}
                onChange={(e) => setField('cs_note', e.target.value)}
                rows={4}
                className="w-full rounded border p-2"
              />
            </div>

            <div>
              <div className="text-xs text-gray-500">性別リクエスト</div>
              <div>{shift.gender_request_name || '—'}</div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <div className="font-semibold">シフト情報</div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs text-gray-500">開始時間</div>
                <input
                  value={form.shift_start_time}
                  onChange={(e) => setField('shift_start_time', e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>

              <label className="block">
                <div className="text-xs text-gray-500">終了時間</div>
                <input
                  value={form.shift_end_time}
                  onChange={(e) => setField('shift_end_time', e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>
            </div>

            <label className="block">
              <div className="text-xs text-gray-500">service_code</div>
              <input
                value={form.service_code}
                onChange={(e) => setField('service_code', e.target.value)}
                className="w-full rounded border p-2"
              />
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <div className="text-xs text-gray-500">staff_01</div>
                <select
                  value={form.staff_01_user_id}
                  onChange={(e) => setField('staff_01_user_id', e.target.value)}
                  className="w-full rounded border p-2"
                >
                  <option value="">未設定</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="block">
                  <div className="text-xs text-gray-500">staff_02</div>
                  <select
                    value={form.staff_02_user_id}
                    onChange={(e) => setField('staff_02_user_id', e.target.value)}
                    className="w-full rounded border p-2"
                  >
                    <option value="">未設定</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.staff_02_attend_flg}
                    onChange={(e) => setField('staff_02_attend_flg', e.target.checked)}
                  />
                  同行
                </label>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="block">
                  <div className="text-xs text-gray-500">staff_03</div>
                  <select
                    value={form.staff_03_user_id}
                    onChange={(e) => setField('staff_03_user_id', e.target.value)}
                    className="w-full rounded border p-2"
                  >
                    <option value="">未設定</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.staff_03_attend_flg}
                    onChange={(e) => setField('staff_03_attend_flg', e.target.checked)}
                  />
                  同行
                </label>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <div className="text-xs text-gray-500">required_staff_count</div>
                <input
                  value={form.required_staff_count}
                  onChange={(e) => setField('required_staff_count', e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>

              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.two_person_work_flg}
                  onChange={(e) => setField('two_person_work_flg', e.target.checked)}
                />
                two_person_work_flg
              </label>

              <label className="block">
                <div className="text-xs text-gray-500">judo_ido</div>
                <input
                  value={form.judo_ido}
                  onChange={(e) => setField('judo_ido', e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveShiftOnly}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>

          <Link href={monthlyHref} className="text-blue-600 underline">
            月間シフトへ
          </Link>

          <Link href={clientDetailHref} className="text-blue-600 underline">
            利用者情報（詳細）へ
          </Link>

          {errorMsg ? <span className="text-sm text-red-600">{errorMsg}</span> : null}
          {doneMsg ? <span className="text-sm text-green-600">{doneMsg}</span> : null}
        </div>
      </div>
    </div>
  );
}