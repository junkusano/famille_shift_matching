//components/roster/ShiftDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RosterShiftDialogData, RosterStaff } from '@/types/roster';
import { supabase } from '@/lib/supabaseClient';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createRpaRequestDetails } from "@/lib/spot_offer/createRpaRequestDetails";

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

type SpotOfferRequestTemplate = {
    core_id: string;
    shift_id: number | null;
    template_title: string | null;
    work_address: string | null;
    salary: string | null;
    fare: string | null;
    status: string | null;
    start_at?: string | null;
    end_at?: string | null;
    kaipoke_cs_id?: string | null;
    unit_amount: number | null;
    commute_fee: number | null;
};

type SpotConfirmed = {
    applicant_name: string | null;
    applicant_sex: string | null;
    applicant_control_url: string | null;
    status: string | null;
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

const RPA_TEMPLATE_ID = "caf1a290-b9ac-4eeb-84eb-eb7fd9936c2f";

const toNullableTime = (v: string): string | null => {
    const s0 = v.trim();
    if (!s0) return null;

    if (/^\d{2}:\d{2}$/.test(s0)) {
        return `${s0}:00`;
    }

    if (/^\d{2}:\d{2}:\d{2}$/.test(s0)) {
        return s0;
    }

    if (/^\d{4}$/.test(s0)) {
        return `${s0.slice(0, 2)}:${s0.slice(2, 4)}:00`;
    }

    throw new Error(`時間形式が不正です: ${s0}`);
};

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

const getBreakValidationMessage = (
    startText: string,
    endText: string,
    breakStartText: string,
    breakEndText: string
): string | null => {
    const start = startText.trim() ? toNullableTime(startText) : null;
    const end = endText.trim() ? toNullableTime(endText) : null;
    const breakStart = breakStartText.trim() ? toNullableTime(breakStartText) : null;
    const breakEnd = breakEndText.trim() ? toNullableTime(breakEndText) : null;

    if (!start || !end) return null;

    const toMinutes = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
    };

    let workMinutes = toMinutes(end) - toMinutes(start);
    if (workMinutes < 0) workMinutes += 24 * 60;

    let breakMinutes = 0;

    if (breakStart && breakEnd) {
        breakMinutes = toMinutes(breakEnd) - toMinutes(breakStart);
        if (breakMinutes < 0) breakMinutes += 24 * 60;
    }

    if (workMinutes >= 8 * 60 && breakMinutes < 60) {
        return "8時間以上の勤務のため、1時間以上の休憩を入力してください";
    }

    if (workMinutes > 6 * 60 && breakMinutes < 45) {
        return "6時間を超える勤務のため、45分以上の休憩を入力してください";
    }

    return null;
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
    const [rpaOpen, setRpaOpen] = useState(false);
    const [templateSelectOpen, setTemplateSelectOpen] = useState(false);
    const [templateCandidates, setTemplateCandidates] = useState<SpotOfferRequestTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<SpotOfferRequestTemplate | null>(null);
    const [sendingRpa, setSendingRpa] = useState(false);
    const [breakStartTime, setBreakStartTime] = useState("");
    const [breakEndTime, setBreakEndTime] = useState("");
    const [shiftStartDate, setShiftStartDate] = useState("");
    const [shiftStartTime, setShiftStartTime] = useState("");
    const [shiftEndDate, setShiftEndDate] = useState("");
    const [shiftEndTime, setShiftEndTime] = useState("");
    const [spotConfirmed, setSpotConfirmed] =
    useState<SpotConfirmed | null>(null);

    const breakValidationMessage = useMemo(() => {
    try {
        return getBreakValidationMessage(
            shiftStartTime,
            shiftEndTime,
            breakStartTime,
            breakEndTime
        );
    } catch {
        return null;
    }
}, [
    shiftStartTime,
    shiftEndTime,
    breakStartTime,
    breakEndTime,
]);

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
    useEffect(() => {
    const loadSpotConfirmed = async () => {
        if (!open || !shift?.shift_id) {
            setSpotConfirmed(null);
            return;
        }

        const { data } = await supabase
            .from('spot_offer_request_table')
            .select(`
                applicant_name,
                applicant_sex,
                applicant_control_url,
                status
            `)
            .eq("shift_id", shift.shift_id)
            .in("status", ["募集中", "確定"])
            .maybeSingle();

        setSpotConfirmed(data ?? null);
    };

    loadSpotConfirmed();
}, [open, shift?.shift_id]);

    const monthlyHref = useMemo(() => {
        if (!shift?.kaipoke_cs_id || !shift?.shift_date) return '/portal/roster/monthly';
        const month = String(shift.shift_date).slice(0, 7);
        return `/portal/roster/monthly?kaipoke_cs_id=${encodeURIComponent(
            String(shift.kaipoke_cs_id)
        )}&month=${encodeURIComponent(month)}`;
    }, [shift]);

    const [clientDetailHref, setClientDetailHref] = useState('#');
    const [clientInfoId, setClientInfoId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadClientDetailHref = async () => {
            if (!open || !shift?.kaipoke_cs_id) {
                setClientDetailHref('#');
                setClientInfoId(null);
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
                    setClientInfoId(hit?.id ? String(hit.id) : null);
                    setClientDetailHref(
                        hit?.id
                            ? `/portal/kaipoke-info-detail/${encodeURIComponent(String(hit.id))}`
                            : '#'
                    );
                }
            } catch {
                if (!cancelled) {
                    setClientInfoId(null);
                    setClientDetailHref('#');
                }
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

    const openRpaFromShift = async () => {
        if (!shift?.kaipoke_cs_id) {
            setErrorMsg("利用者IDが取得できません");
            return;
        }

        try {

            const { data, error } = await supabase
                .from("spot_offer_request")
                .select("*")
                .eq("kaipoke_cs_id", shift.kaipoke_cs_id);
            if (error) {
                throw error;
            }

            const rows = Array.from(
                new Map((data ?? []).map((r) => [r.core_id, r])).values()
            );

            if (rows.length === 0) {
                setErrorMsg("利用者に紐づくテンプレートがありません");
                return;
            }

            if (rows.length === 1) {
                setSelectedTemplate(rows[0]);

                setShiftStartDate(form.shift_start_date);
                setShiftEndDate(form.shift_start_date);
                setShiftStartTime(form.shift_start_time);
                setShiftEndTime(form.shift_end_time);

                setBreakStartTime("");
                setBreakEndTime("");

                setRpaOpen(true);
                return;
            }

            setTemplateCandidates(rows);
            setTemplateSelectOpen(true);

        } catch (e) {
            setErrorMsg(
                e instanceof Error ? e.message : "テンプレート取得に失敗しました"
            );

        }
    };

    const sendRpaRequest = async () => {
        if (!selectedTemplate) {
            alert("テンプレートが選択されていません");
            return;
        }

        if (!shiftStartDate.trim()) {
            alert("shift_start_date は必須です");
            return;
        }

        if (!shiftEndDate.trim()) {
            alert("shift_end_date は必須です");
            return;
        }
        if (breakValidationMessage) {
            alert(breakValidationMessage);
            return;
       }
        const start = toNullableTime(shiftStartTime);
        const end = toNullableTime(shiftEndTime);
        const breakStart = breakStartTime.trim() ? toNullableTime(breakStartTime) : null;
        const breakEnd = breakEndTime.trim() ? toNullableTime(breakEndTime) : null;

        const toMinutes = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
        };

        if (start && end) {
            let workMinutes = toMinutes(end) - toMinutes(start);

            // 日跨ぎ対応
            if (workMinutes < 0) {
                workMinutes += 24 * 60;
            }

            let breakMinutes = 0;

            if (breakStart && breakEnd) {
                breakMinutes = toMinutes(breakEnd) - toMinutes(breakStart);

                // 日跨ぎ対応
                if (breakMinutes < 0) {
                    breakMinutes += 24 * 60;
                }
            }

            if (workMinutes < 60) {
                alert("勤務時間は1時間以上で入力してください");
                return;
            }

            if (workMinutes >= 8 * 60 && breakMinutes < 60) {
                alert("勤務時間が8時間以上の場合、1時間以上の休憩が必要です");
                return;
            }

            if (workMinutes > 6 * 60 && breakMinutes < 45) {
                alert("勤務時間が6時間1分以上の場合、45分以上の休憩が必要です");
                return;
            }
        }

        try {
            setSendingRpa(true);

            const session = await supabase.auth.getSession();
            const authUserId = session.data?.session?.user?.id;

            if (!authUserId) {
                throw new Error("ログインユーザー未取得");
            }
            // 重複チェック
            const { data: existingRequest } = await supabase
                .from("spot_offer_request_table")
                .select("shift_id,status")
                .eq("shift_id", form.shift_id)
                .in("status", ["募集中", "確定"])
                .maybeSingle();

            if (existingRequest) {
                throw new Error(`このシフトは既にスポット募集が開始されています（${existingRequest.status}）`
                );
            }



            const { data: userData, error: userError } = await supabase
                .from("user_entry_united_view")
                .select("manager_auth_user_id, manager_user_id, user_id")
                .eq("auth_user_id", authUserId)
                .eq("group_type", "人事労務サポートルーム")
                .limit(1)
                .single();

            if (userError || !userData?.manager_auth_user_id) {
                throw new Error("承認者（マネージャー）情報取得に失敗しました");
            }

            const details = createRpaRequestDetails({
              selectedTemplate,
              form,
              shift,
              shiftStartDate,
              start,
              end,
              breakStart,
              breakEnd,
              userData,
            });

            const { error: insertError } = await supabase
                .from("rpa_command_requests")
                .insert({
                    template_id: RPA_TEMPLATE_ID,
                    requester_id: authUserId,
                    approver_id: userData.manager_auth_user_id,
                    status: "approved",
                    request_details: details,
                });

            if (insertError) {
                throw new Error(
                    `RPAリクエスト送信に失敗: ${insertError.message}`
                );
            }

            const { error: spotStatusError } = await supabase
                .from("spot_offer_request_table")
                .upsert(
                    {
                        shift_id: form.shift_id,
                        core_id: selectedTemplate.core_id,
                        template_title: selectedTemplate.template_title ?? null,
                        kaipoke_cs_id: shift?.kaipoke_cs_id ?? selectedTemplate.kaipoke_cs_id ?? null,
                        shift_start_date: shiftStartDate.trim(),
                        shift_start_time: start,
                        shift_end_time: end,
                        start_at: start,
                        end_at: end,
                        unit_amount: selectedTemplate.unit_amount ?? 1330,
                        commute_fee: selectedTemplate.commute_fee ?? 200,
                        status: "募集なし",
                        updated_at: new Date().toISOString(),
                    },
                    {
                        onConflict: "shift_id",
                    }
                );

            if (spotStatusError) {
                throw new Error(
                    `スポット募集ステータス更新に失敗: ${spotStatusError.message}`
                );
            }

            alert("RPAリクエストを送信しました");
            setRpaOpen(false);
            setSelectedTemplate(null);
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSendingRpa(false);
        }
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

            // ① shift 側を保存
            const res = await fetch('/api/shifts', {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    shift_id: form.shift_id,
                    shift_start_date: form.shift_start_date,
                    shift_start_time: form.shift_start_time,
                    shift_end_time: form.shift_end_time,
                    service_code: form.service_code || null,
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

            // ② 利用者情報側を保存（希望性別・備考）
            if (clientInfoId) {
                const { error: clientUpdateError } = await supabase
                    .from('cs_kaipoke_info')
                    .update({
                        gender_request: form.gender_request || null,
                        biko: form.cs_note.trim() || null,
                    })
                    .eq('id', clientInfoId);

                if (clientUpdateError) {
                    throw new Error(`利用者情報の保存に失敗しました: ${clientUpdateError.message}`);
                }
            }

            const next: RosterShiftDialogData = {
                ...shift,
                shift_id: form.shift_id,
                shift_date: form.shift_start_date,
                start_at: form.shift_start_time,
                end_at: form.shift_end_time,
                service_code: form.service_code,
                service_name:
                    serviceOptions.find((o) => o.value === form.service_code)?.label ??
                    shift.service_name ??
                    '',
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
        <>
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
{spotConfirmed?.status === "募集中" && (
  <div className="rounded border border-orange-300 bg-orange-50 p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="font-medium text-orange-700">
        スポット募集中
      </div>

      <Button
        size="sm"
        variant="destructive"
        onClick={async () => {
          if (!confirm("このシフトのタイミー募集を取り下げますか？")) {
            return;
          }

          const res = await fetch("/api/spot-offer/withdraw", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shift_id: form.shift_id,
            }),
          });

          const json = await res.json();

          if (!res.ok || !json.ok) {
            alert(json.error ?? "タイミー取り下げ依頼に失敗しました");
            return;
          }

          alert("タイミー取り下げ依頼を作成しました");
        }}
      >
        タイミー取り下げ
      </Button>
    </div>
  </div>
)}

{spotConfirmed?.status === "確定" && (
    <div className="rounded border border-green-300 bg-green-50 p-3">
        <div className="text-xs text-gray-500">
            スポット確定
        </div>

        <div className="font-medium">
            {spotConfirmed.applicant_name}
            （{spotConfirmed.applicant_sex}）
        </div>

        {spotConfirmed.applicant_control_url && (
            <a
                href={spotConfirmed.applicant_control_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline break-all"
            >
                応募者管理画面
            </a>
        )}
    </div>
)}
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
                        {errorMsg ? (
                            <div className="text-sm text-red-600">
                                {errorMsg}

                             {errorMsg === "利用者に紐づくテンプレートがありません" && (
                                    <div className="mt-1">
                                        <Link
                                         href="/portal/spot-offer-template"
                                        target="_blank"
                                        className="text-blue-600 underline"   
                                    >
                                     テンプレートを作成する   
                                     </Link>
                                    </div>
                                 )}
                            </div>
                        ) : null}

                        {doneMsg ? <span className="text-sm text-green-600">{doneMsg}</span> : null}

                        <Link href={clientDetailHref} className="text-blue-600 underline">
                            利用者情報（詳細）へ
                        </Link>

                        <Link href={monthlyHref} className="text-blue-600 underline">
                            月間シフトへ
                        </Link>

                        <button
                            type="button"
                            onClick={openRpaFromShift}
                            className="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
                        >
                            スポット募集
                        </button>

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

            <Dialog open={templateSelectOpen} onOpenChange={setTemplateSelectOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>テンプレート選択</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-2">
                        {templateCandidates.map((t) => (
                            <button
                                key={t.core_id}
                                type="button"
                                onClick={() => {
                                    setSelectedTemplate(t);

                                    setShiftStartDate(form.shift_start_date);
                                    setShiftEndDate(form.shift_start_date);
                                    setShiftStartTime(form.shift_start_time);
                                    setShiftEndTime(form.shift_end_time);

                                    setBreakStartTime("");
                                    setBreakEndTime("");

                                    setTemplateSelectOpen(false);
                                    setRpaOpen(true);
                                }}
                                className="w-full rounded border p-3 text-left hover:bg-gray-50"
                            >
                                <div className="font-semibold">
                                    {t.template_title ?? "(無題)"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {t.start_at ?? "-"} ～ {t.end_at ?? "-"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {t.work_address ?? ""}
                                </div>
                            </button>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setTemplateSelectOpen(false)}>
                            閉じる
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={rpaOpen} onOpenChange={setRpaOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>RPAリクエスト作成</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="text-sm">
                            <div className="font-medium">
                                {selectedTemplate?.template_title ?? ""}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                core_id: {selectedTemplate?.core_id ?? ""}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <div className="text-[11px] text-muted-foreground">shift_start_date（必須）</div>
                                <Input
                                    type="date"
                                    value={shiftStartDate}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setShiftStartDate(v);
                                        setShiftEndDate(v);
                                    }}
                                />
                            </div>

                            <div>
                                <div className="text-[11px] text-muted-foreground">shift_start_time（任意）</div>
                                <Input
                                    value={shiftStartTime}
                                    onChange={(e) => setShiftStartTime(e.target.value)}
                                    placeholder="0930 / 09:30（空欄OK）"
                                />
                                <div className="mt-1 text-xs text-red-600">
                                    勤務時間は1時間以上にしてください
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] text-muted-foreground">shift_end_date（必須）</div>
                                <Input
                                    type="date"
                                    value={shiftEndDate}
                                    onChange={(e) => setShiftEndDate(e.target.value)}
                                />
                            </div>

                            <div>
                                <div className="text-[11px] text-muted-foreground">shift_end_time（任意）</div>
                                <Input
                                    value={shiftEndTime}
                                    onChange={(e) => setShiftEndTime(e.target.value)}
                                    placeholder="0930 / 09:30（空欄OK）"
                                />
                            </div>

                            <div>
                                <div className="text-[11px] text-muted-foreground">休憩開始（任意）</div>
                                <Input
                                    value={breakStartTime}
                                    onChange={(e) => setBreakStartTime(e.target.value)}
                                    placeholder="1200 / 12:00（空欄OK）"
                                />
                            </div>

                            <div>
                                <div className="text-[11px] text-muted-foreground">休憩終了（任意）</div>
                                <Input
                                    value={breakEndTime}
                                    onChange={(e) => setBreakEndTime(e.target.value)}
                                    placeholder="1230 / 12:30（空欄OK）"
                                />
                            </div>
                            {breakValidationMessage && (
                                <div className="col-span-full text-xs text-red-600">
                                    {breakValidationMessage}
                                </div>
                            )}
                        </div>

                        <div className="text-[11px] text-muted-foreground">
                            ※ このページは RPAテンプレートID: {RPA_TEMPLATE_ID} に対して request_details を作成します。
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => setRpaOpen(false)}
                            disabled={sendingRpa}
                        >
                            閉じる
                        </Button>
                        <Button onClick={sendRpaRequest} disabled={sendingRpa}>
                            {sendingRpa ? "送信中..." : "RPAリクエスト送信"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
