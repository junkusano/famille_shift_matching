"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { extractFilterOptions, ShiftFilterOptions } from "@/lib/supabase/shiftFilterOptions";
import type { SupabaseShiftRaw, ShiftData } from "@/types/shift";
import Image from 'next/image';

const PAGE_SIZE = 50;

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [filteredShifts, setFilteredShifts] = useState<ShiftData[]>([]);
    //const [selectedShift, setSelectedShift] = useState<ShiftData | null>(null);
    const [accountId, setAccountId] = useState<string>("");
    void accountId;
    const [currentPage, setCurrentPage] = useState(1);
    const [filterOptions, setFilterOptions] = useState<ShiftFilterOptions>({
        dateOptions: [],
        serviceOptions: [],
        postalOptions: [],
        nameOptions: [],
        genderOptions: [],
    });
    const [filterDate, setFilterDate] = useState<string[]>([]);
    const [filterService, setFilterService] = useState<string[]>([]);
    const [filterPostal, setFilterPostal] = useState<string[]>([]);
    const [filterName, setFilterName] = useState<string[]>([]);
    const [filterGender, setFilterGender] = useState<string[]>([]);
    const [creatingShiftRequest, setCreatingShiftRequest] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from("users")
                .select("account_id")
                .eq("auth_user_id", user.id)
                .single();
            setAccountId(userRecord?.account_id || "");

            const { data: shiftData } = await supabase
                .from("shift_csinfo_postalname_view")
                .select(`*`)
                .gte("shift_start_date", jstNow);

            const { data: postalDistricts } = await supabase
                .from("postal_district")
                .select("postal_code_3, district")
                .order("postal_code_3");

            if (!shiftData) return;

            const formatted = (shiftData as SupabaseShiftRaw[])
                .filter((s) => s.staff_01_user_id === null || (s.level_sort_order !== undefined && s.level_sort_order < 5000000 && s.level_sort_order !== 1250000))
                .map((s): ShiftData => ({
                    shift_id: s.shift_id,
                    shift_start_date: s.shift_start_date,
                    shift_start_time: s.shift_start_time,
                    shift_end_time: s.shift_end_time,
                    service_code: s.service_code,
                    kaipoke_cs_id: s.kaipoke_cs_id,
                    staff_01_user_id: s.staff_01_user_id,
                    staff_02_user_id: s.staff_02_user_id,
                    staff_03_user_id: s.staff_03_user_id,
                    address: s.postal_code || "",
                    client_name: s.name || "",
                    gender_request_name: s.gender_request_name || "",
                    male_flg: s.male_flg || false,
                    female_flg: s.female_flg || false,
                    postal_code_3: s.postal_code_3 || "",
                    district: s.district || "",
                }));

            const sorted = formatted.sort((a, b) => {
                const d1 = a.shift_start_date + a.shift_start_time;
                const d2 = b.shift_start_date + b.shift_start_time;
                if (d1 !== d2) return d1.localeCompare(d2);
                if (a.postal_code_3 !== b.postal_code_3) return a.postal_code_3.localeCompare(b.postal_code_3);
                return a.client_name.localeCompare(b.client_name);
            });

            setShifts(sorted);
            setFilteredShifts(sorted);
            setFilterOptions(extractFilterOptions(sorted, postalDistricts));
        };

        fetchData();
    }, []);

    const applyFilters = () => {
        const result = shifts.filter((s) =>
            (!filterDate.length || filterDate.includes(s.shift_start_date)) &&
            (!filterService.length || filterService.includes(s.service_code)) &&
            (!filterPostal.length || filterPostal.includes(s.postal_code_3)) &&
            (!filterName.length || filterName.includes(s.client_name)) &&
            (!filterGender.length || filterGender.includes(s.gender_request_name))
        );
        setFilteredShifts(result);
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilterDate([]);
        setFilterService([]);
        setFilterPostal([]);
        setFilterName([]);
        setFilterGender([]);
        setFilteredShifts(shifts);
        setCurrentPage(1);
    };

    // 2. handleShiftRequest を修正
    const handleShiftRequest = async (shift: ShiftData, attendRequest: boolean) => {
        setCreatingShiftRequest(true);
        try {
            const session = await supabase.auth.getSession();
            const userId = session.data?.session?.user?.id;
            if (!userId) {
                alert("ログイン情報が取得できません");
                return;
            }

            const { error } = await supabase.from("rpa_command_requests").insert({
                template_id: "92932ea2-b450-4ed0-a07b-4888750da641",
                requester_id: userId,
                approver_id: userId,
                status: "approved",
                request_details: {
                    kaipoke_cs_id: shift.kaipoke_cs_id,
                    shift_start_date: shift.shift_start_date,
                    shift_start_time: shift.shift_start_time,
                    service_code: shift.service_code,
                    postal_code_3: shift.postal_code_3,
                    client_name: shift.client_name,
                    requested_by: userId,
                    attend_request: attendRequest,
                },
            });

            if (error) {
                alert("送信に失敗しました: " + error.message);
            } else {
                alert("希望リクエストを登録しました！");

                // チャンネル取得
                const { data: chanData } = await supabase
                    .from("group_lw_channel_view")
                    .select("channel_id")
                    .eq("group_account", shift.kaipoke_cs_id)
                    .maybeSingle();

                // 投稿者情報取得
                const { data: userData } = await supabase
                    .from("user_entry_united_view")
                    .select("lw_userid, last_name_kanji, first_name_kanji")
                    .eq("auth_user_id", userId)
                    .maybeSingle();

                const sender = userData?.lw_userid
                const mention = sender ? `<m userId="${sender}">さん` : `${sender ?? '不明'}さん`;

                if (chanData?.channel_id) {
                    const message = `✅シフト希望が登録されました\n\n・カイポケ反映までお待ちください\n\n・日付: ${shift.shift_start_date}\n・時間: ${shift.shift_start_time}～${shift.shift_end_time}\n・利用者: ${shift.client_name} 様\n・種別: ${shift.service_code}\n・エリア: ${shift.postal_code_3}（${shift.district}）\n・同行希望: ${attendRequest ? "あり" : "なし"}\n・担当者: ${mention}`;

                    await fetch('/api/lw-send-botmessage', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            channelId: chanData.channel_id,
                            text: message,
                        }),
                    });
                } else {
                    console.warn('チャネルIDが取得できませんでした');
                }
            }
        } catch (e) {
            alert("処理中にエラーが発生しました");
            console.error(e);
        } finally {
            setCreatingShiftRequest(false);
        }
    };

    const start = (currentPage - 1) * PAGE_SIZE;
    const paginatedShifts = filteredShifts.slice(start, start + PAGE_SIZE);

    return (
        <div className="content">
            <h2 className="text-xl font-bold mb-4">シフト一覧</h2>

            <table style={{ width: '100%', borderSpacing: '1rem 0' }}>
                <tbody>
                    <tr>
                        <td style={{ width: '50%' }}>
                            <label className="text-xs">日付（複数選択）</label>
                            <select
                                multiple
                                value={filterDate}
                                onChange={(e) => setFilterDate(Array.from(e.target.selectedOptions, (o) => o.value))}
                                className="w-full border rounded p-1 h-[6rem]"
                            >
                                {filterOptions.dateOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </td>
                        <td style={{ width: '50%' }}>
                            <label className="text-xs">種別（複数選択）</label>
                            <select
                                multiple
                                value={filterService}
                                onChange={(e) => setFilterService(Array.from(e.target.selectedOptions, (o) => o.value))}
                                className="w-full border rounded p-1 h-[6rem]"
                            >
                                {filterOptions.serviceOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </td>
                    </tr>
                    <tr>

                        <td style={{ width: '50%' }}>
                            <label className="text-xs">住所エリア（複数選択）</label>
                            <select
                                multiple
                                value={filterPostal}
                                onChange={(e) => setFilterPostal(Array.from(e.target.selectedOptions, (o) => o.value))}
                                className="w-full border rounded p-1 h-[6rem]"
                            >
                                {filterOptions.postalOptions.map((p) => (
                                    <option key={p.postal_code_3} value={p.postal_code_3}>
                                        {p.postal_code_3}（{p.district}）
                                    </option>
                                ))}
                            </select>
                        </td>
                        <td style={{ width: '50%' }}>
                            <label className="text-xs">利用者名（複数選択）</label>
                            <select
                                multiple
                                value={filterName}
                                onChange={(e) => setFilterName(Array.from(e.target.selectedOptions, (o) => o.value))}
                                className="w-full border rounded p-1 h-[6rem]"
                            >
                                {filterOptions.nameOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td style={{ width: '50%' }}>
                            <label className="text-xs">ヘルパー希望（複数選択）</label>
                            <select
                                multiple
                                value={filterGender}
                                onChange={(e) => setFilterGender(Array.from(e.target.selectedOptions, (o) => o.value))}
                                className="w-full border rounded p-1 h-[6rem]"
                            >
                                {filterOptions.genderOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </td>
                        <td style={{ width: '50%' }}>
                            <Button onClick={applyFilters} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                フィルターを適用
                            </Button>
                            <Button onClick={clearFilters} className="w-full bg-gray-400 hover:bg-gray-500 text-white">
                                フィルター解除
                            </Button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {paginatedShifts.map((shift) => (
                    <Card key={shift.shift_id} className="shadow">
                        <CardContent className="p-4">
                            <div className="text-sm font-semibold">
                                {shift.shift_start_date} {shift.shift_start_time}～{shift.shift_end_time}
                            </div>
                            <div className="text-sm">種別: {shift.service_code}</div>
                            <div className="text-sm">郵便番号: {shift.address}</div>
                            <div className="text-sm">エリア: {shift.district}</div>
                            <div className="text-sm">利用者名: {shift.client_name}　様</div>
                            <div className="text-sm">性別希望: {shift.gender_request_name}</div>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
                                <ShiftRequestDialog
                                    shift={shift}
                                    creating={creatingShiftRequest}
                                    onConfirm={(attendRequest) => {
                                        handleShiftRequest(shift, attendRequest); // ✅ 直接渡す
                                    }}
                                />
                                {/* 横並びにする追加ボタン */}
                                <GroupAddButton shift={shift} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex justify-between mt-6">
                <Button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    戻る
                </Button>
                <Button
                    disabled={start + PAGE_SIZE >= filteredShifts.length}
                    onClick={() => setCurrentPage((p) => p + 1)}
                >
                    次へ
                </Button>
            </div>
        </div>
    );
}

function ShiftRequestDialog({
    onConfirm,
    creating,
    shift,
}: {
    onConfirm: (attendRequest: boolean) => void;
    creating: boolean;
    shift: ShiftData;
}) {
    const [open, setOpen] = useState(false);
    const [attendRequest, setAttendRequest] = useState(false);

    const handleCancel = () => setOpen(false);
    const handleConfirm = () => {
        onConfirm(attendRequest);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => setOpen(true)}>このシフトを希望する</Button>
            </DialogTrigger>
            <DialogContent className="dialog-content ml-4" style={{ maxWidth: '95vw' }}>
                <DialogTitle>このシフトを希望しますか？</DialogTitle>
                <DialogDescription>
                    希望を送信すると、シフトコーディネート申請が開始されます。
                    <div className="mt-2 text-sm text-gray-500">
                        利用者: {shift.client_name} / 日付: {shift.shift_start_date} / サービス: {shift.service_code}
                    </div>
                    <label className="flex items-center mt-4 gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={attendRequest}
                            onChange={(e) => setAttendRequest(e.target.checked)}
                        />
                        同行を希望する
                    </label>
                </DialogDescription>
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={handleCancel}>キャンセル</Button>
                    <Button onClick={handleConfirm} disabled={creating}>
                        {creating ? "送信中..." : "希望を送信"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function GroupAddButton({ shift }: { shift: ShiftData }) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    const handleConfirm = async () => {
        setProcessing(true);
        try {
            const session = await supabase.auth.getSession();
            const userId = session.data?.session?.user?.id;
            if (!userId) throw new Error("ユーザー情報取得失敗");

            const { data: chanData } = await supabase
                .from("group_lw_channel_view")
                .select("group_id")
                .eq("group_account", shift.kaipoke_cs_id)
                .maybeSingle();

            const { data: userData } = await supabase
                .from("user_entry_united_view")
                .select("lw_userid")
                .eq("auth_user_id", userId)
                .maybeSingle();

            const senderId = userData?.lw_userid;
            if (!chanData?.group_id || !senderId) throw new Error("groupId または userId が不明です");

            const res = await fetch('/api/lw-group-user-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupId: chanData.group_id,
                    userId: senderId,
                }),
            });

            const text = await res.text();
            if (!res.ok) {
                if (text.includes('Group member already exist')) {
                    alert('✅ すでにグループメンバーに追加されています。');
                } else {
                    alert(`❌ グループ追加失敗: ${text}`);
                }
            } else {
                alert('✅ グループに追加されました');
            }
        } catch (e) {
            alert('エラー: ' + (e instanceof Error ? e.message : '不明なエラー'));
        } finally {
            setProcessing(false);
            setOpen(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="mt-2 text-xs flex items-center gap-1 px-2 py-1 border border-gray-400 rounded hover:bg-gray-100">
                    <Image src="/8aeeac38-ce77-4c97-b2e9-2fcd97c5ed4a.jpg" alt="LW" width={16} height={16} />
                    <span>グループ追加</span>
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>メンバー追加確認</DialogTitle>
                <DialogDescription>
                    {shift.client_name} 様の情報連携グループにメンバー追加しますか？
                </DialogDescription>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setOpen(false)} className="border rounded px-3 py-1 text-sm">キャンセル</button>
                    <button onClick={handleConfirm} disabled={processing} className="bg-blue-600 text-white rounded px-4 py-1 text-sm">
                        {processing ? '追加中...' : 'OK'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
