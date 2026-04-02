//components/roster/ShiftDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RosterShiftDialogData, RosterStaff } from '@/types/roster';
import { supabase } from '@/lib/supabaseClient';

type ServiceOption = {
    value: string;
    label: string;
};

type FormState = {
    shift_id: number | null;
    shift_start_date: string;
    shift_start_time: string;
    shift_end_time: string;
    service_code: string;
    gender_request: string;
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

type Props = {
    open: boolean;
    onClose: () => void;
    shift: RosterShiftDialogData | null;
    staffOptions: RosterStaff[];
    serviceOptions: ServiceOption[];
    onSaved?: (next: RosterShiftDialogData) => void;
};

const GENDER_OPTIONS = [
    { id: '', label: '未設定' },
    { id: '9b32a1f0-f711-4ab4-92fb-0331f0c86d42', label: '男性希望' },
    { id: '42224870-c644-48a5-87e2-7df9c24bca5b', label: '女性希望' },
    { id: '554d705b-85ec-4437-9352-4b026e2e904f', label: '男女問わず' },
];

const emptyForm: FormState = {
    shift_id: null,
    shift_start_date: '',
    shift_start_time: '',
    shift_end_time: '',
    service_code: '',
    gender_request: '',
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

const dispTime = (v?: string | null) => {
    if (!v) return '';
    const m = String(v).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(v);
    return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export default function ShiftDialog({
    open,
    onClose,
    shift,
    staffOptions,
    serviceOptions,
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
            shift_start_time: dispTime(shift.start_at),
            shift_end_time: dispTime(shift.end_at),
            service_code: shift.service_code ?? '',
            gender_request: shift.gender_request ?? '',
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

    const [clientDetailHref, setClientDetailHref] = useState('#');

    useEffect(() => {
        let cancelled = false;

        const loadClientDetailHref = async () => {
            if (!open || !shift?.kaipoke_cs_id) {
                setClientDetailHref('#');
                return;
            }

            try {
                const res = await fetch('/api/kaipoke-info', {
                    credentials: 'same-origin',
                });
                const rows = (await res.json().catch(() => [])) as Array<{
                    id?: string | null;
                    kaipoke_cs_id?: string | number | null;
                }>;

                const hit = rows.find(
                    (r) => String(r.kaipoke_cs_id ?? '') === String(shift.kaipoke_cs_id ?? '')
                );

                if (!cancelled) {
                    setClientDetailHref(
                        hit?.id
                            ? `/portal/kaipoke-info-detail/${encodeURIComponent(String(hit.id))}`
                            : '#'
                    );
                }
            } catch {
                if (!cancelled) setClientDetailHref('#');
            }
        };

        loadClientDetailHref();
        return () => {
            cancelled = true;
        };
    }, [open, shift?.kaipoke_cs_id]);

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
            const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
            if (sessErr) {
                console.warn('[ShiftDialog] getSession error', sessErr);
            }

            const token = sessionData.session?.access_token ?? null;

            if (!token) {
                throw new Error('ログインセッションが取得できません。再ログイン後にお試しください。');
            }

            const res = await fetch('/api/shifts', {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    shift_id: form.shift_id,
                    shift_start_date: form.shift_start_date,
                    shift_start_time: form.shift_start_time,
                    shift_end_time: form.shift_end_time,
                    service_code: form.service_code || null,
                    gender_request: form.gender_request || null,
                    staff_01_user_id: form.staff_01_user_id || null,
                    staff_02_user_id: form.staff_02_user_id || null,
                    staff_03_user_id: form.staff_03_user_id || null,
                    staff_02_attend_flg: form.staff_02_attend_flg,
                    staff_03_attend_flg: form.staff_03_attend_flg,
                    required_staff_count: Number(form.required_staff_count || 1),
                    two_person_work_flg: form.two_person_work_flg,
                    judo_ido: form.judo_ido || null,
                    cs_note: form.cs_note || null,
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
                gender_request: form.gender_request || null,
                gender_request_name:
                    GENDER_OPTIONS.find((g) => g.id === form.gender_request)?.label ?? null,
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

                        <label className="block">
                            <div className="text-xs text-gray-500">備考</div>
                            <textarea
                                value={form.cs_note}
                                onChange={(e) => setField('cs_note', e.target.value)}
                                rows={4}
                                className="w-full rounded border p-2"
                            />
                        </label>

                        <label className="block">
                            <div className="text-xs text-gray-500">希望性別</div>
                            <select
                                value={form.gender_request}
                                onChange={(e) => setField('gender_request', e.target.value)}
                                className="w-full rounded border p-2"
                            >
                                {GENDER_OPTIONS.map((g) => (
                                    <option key={g.id} value={g.id}>
                                        {g.label}
                                    </option>
                                ))}
                            </select>
                        </label>
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
                            <div className="text-xs text-gray-500">サービス</div>
                            <select
                                value={form.service_code}
                                onChange={(e) => setField('service_code', e.target.value)}
                                className="w-full rounded border p-2"
                            >
                                <option value="">未設定</option>
                                {serviceOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="grid grid-cols-1 gap-3">
                            <label className="block">
                                <div className="text-xs text-gray-500">スタッフ1</div>
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
                                    <div className="text-xs text-gray-500">スタッフ2</div>
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
                                    <div className="text-xs text-gray-500">スタッフ3</div>
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
                                <div className="text-xs text-gray-500">派遣人数</div>
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
                                二人同時作業
                            </label>

                            <label className="block">
                                <div className="text-xs text-gray-500">重度移動</div>
                                <input
                                    value={form.judo_ido}
                                    onChange={(e) => setField('judo_ido', e.target.value)}
                                    className="w-full rounded border p-2"
                                />
                            </label>
                        </div>
                    </section>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                    {errorMsg ? <span className="text-sm text-red-600">{errorMsg}</span> : null}
                    {doneMsg ? <span className="text-sm text-green-600">{doneMsg}</span> : null}

                    <Link href={clientDetailHref} className="text-blue-600 underline">
                        利用者情報（詳細）へ
                    </Link>

                    <Link href={monthlyHref} className="text-blue-600 underline">
                        月間シフトへ
                    </Link>

                    <button
                        type="button"
                        onClick={saveShiftOnly}
                        disabled={saving}
                        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                    >
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}