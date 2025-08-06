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
import { format, addDays, subDays } from "date-fns";
import Image from 'next/image';
//import { ShiftData } from "@/types/shift";  // typesディレクトリがある場合
//import type { SupabaseShiftRaw, ShiftData } from "@/types/shift";
import type { ShiftData } from "@/types/shift";
//import { extractFilterOptions, ShiftFilterOptions } from "@/lib/supabase/shiftFilterOptions";

const PAGE_SIZE = 50;

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]); // ShiftData 型を使用
    const [currentPage, setCurrentPage] = useState(1);
    const [currentDate, setCurrentDate] = useState<string>("");
    const [userId, setUserId] = useState<string>(""); // auth_user_idを基にユーザーIDを設定
    void userId;
    const [shiftDate, setShiftDate] = useState<Date>(new Date());  // シフトの日付
    const [accountId, setAccountId] = useState<string>("");
    void accountId;
    const [kaipokeUserId, setKaipokeUserId] = useState<string>(""); // 追加
    void kaipokeUserId;

    // startISO と endISO を使わないなら削除
    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id, kaipoke_user_id")
                .eq("auth_user_id", user.id)
                .single();

            if (!userRecord?.user_id) return;

            setAccountId(userRecord.user_id);
            setKaipokeUserId(userRecord.kaipoke_user_id || "");
            setUserId(userRecord.user_id);

            // 30日前から全件取得
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const thirtyDaysISO = thirtyDaysAgo.toISOString();

            const allShifts = [];
            for (let i = 0; i < 10; i++) {
                const { data, error } = await supabase
                    .from("shift_csinfo_postalname_view")
                    .select("*")
                    .gte("shift_start_date", thirtyDaysISO)
                    .order("shift_start_date", { ascending: true })
                    .range(i * 1000, (i + 1) * 1000 - 1);

                if (error || !data?.length) break;
                allShifts.push(...data);
            }

            // ログインユーザーのシフトだけ
            const filteredByUser = allShifts.filter(
                s => [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(userRecord.user_id)
            );

            // 現在選択日でフィルター（JSTベース）
            const startOfDay = new Date(shiftDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(shiftDate);
            endOfDay.setHours(23, 59, 59, 999);

            const filteredByDate = filteredByUser.filter(s => {
                const shiftTime = new Date(`${s.shift_start_date}T${s.shift_start_time}`).getTime();
                return shiftTime >= startOfDay.getTime() && shiftTime <= endOfDay.getTime();
            });

            // ソート & districtを住所に使用
            const sorted = filteredByDate.sort((a, b) => {
                const d1 = a.shift_start_date + a.shift_start_time;
                const d2 = b.shift_start_date + b.shift_start_time;
                return d1.localeCompare(d2);
            });

            setShifts(sorted.map(s => ({
                shift_id: s.shift_id,
                shift_start_date: s.shift_start_date,
                shift_start_time: s.shift_start_time,
                shift_end_time: s.shift_end_time,
                service_code: s.service_code,
                kaipoke_cs_id: s.kaipoke_cs_id,
                staff_01_user_id: s.staff_01_user_id,
                staff_02_user_id: s.staff_02_user_id,
                staff_03_user_id: s.staff_03_user_id,
                address: s.district || "",
                client_name: s.name || "",
                gender_request_name: s.gender_request_name || "",
                male_flg: s.male_flg || false,
                female_flg: s.female_flg || false,
                postal_code_3: s.postal_code_3 || "",
                district: s.district || "",
            })));
        };

        fetchData();
    }, [shiftDate]);



    const handlePrevDay = () => setShiftDate(subDays(shiftDate, 1));
    const handleNextDay = () => setShiftDate(addDays(shiftDate, 1));


    // ページネーション
    const start = (currentPage - 1) * PAGE_SIZE;
    const paginatedShifts = shifts.slice(start, start + PAGE_SIZE);

    const handleShiftDelete = async (shift: ShiftData, reason: string) => {
        const session = await supabase.auth.getSession();
        const userId = session.data?.session?.user?.id;
        if (!userId) {
            alert("ログイン情報が取得できません");
            return;
        }

        await supabase.from("shift_deletions").insert({
            shift_id: shift.shift_id,
            user_id: userId,
            reason,
        });

        alert("シフト削除リクエストが完了しました！");
    };
    return (
        <div className="content">
            <div className="content">
                <div className="flex justify-between mb-4 items-center">
                    <Button onClick={handlePrevDay}>前の日</Button>
                    <span className="text-xl font-bold">{format(shiftDate, "Y年M月d日")}</span>
                    <Button onClick={handleNextDay}>次の日</Button>
                </div>
                {/* 以下シフト表示 */}
            </div>

            <div className="text-right mb-4">
                <Button onClick={() => alert("全シフトを削除します。")} className="bg-red-500 text-white">
                    この日はお休み希望
                </Button>
            </div>

            {/* シフトが0件でも表示 */}
            {paginatedShifts.length === 0 ? (
                <div className="text-sm text-gray-500">シフトがありません</div>
            ) : (
                paginatedShifts.map((shift) => (
                    <Card key={shift.shift_id} className="shadow">
                        <CardContent>
                            <div className="text-sm font-semibold">
                                {shift.shift_start_date} {shift.shift_start_time}～{shift.shift_end_time}
                            </div>
                            <div className="text-sm">利用者: {shift.client_name}</div>
                            <div className="text-sm">エリア: {shift.address}</div>
                            <div className="text-sm">サービス種別: {shift.service_code}</div>
                            <div className="flex gap-2 mt-4">
                                <ShiftDeleteDialog shift={shift} onConfirm={handleShiftDelete} />
                            </div>
                            {/* 横並びにする追加ボタン */}
                            <GroupAddButton shift={shift} />
                        </CardContent>
                    </Card>
                ))
            )}

            <div className="flex justify-between mt-6">
                <Button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
                    前の日
                </Button>
                <Button
                    disabled={start + PAGE_SIZE >= shifts.length}
                    onClick={() => setCurrentPage(currentPage + 1)}
                >
                    次の日
                </Button>
            </div>
        </div>
    );
}
function ShiftDeleteDialog({
    shift,
    onConfirm
}: {
    shift: ShiftData;
    onConfirm: (shift: ShiftData, reason: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => setOpen(true)} className="bg-red-500 text-white">このシフトを削除</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>シフト削除</DialogTitle>
                <DialogDescription>
                    {shift.client_name} 様のシフトを削除しますか？
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="削除理由"
                        className="w-full mt-2 p-2 border"
                    />
                </DialogDescription>
                <div className="flex justify-end gap-2 mt-4">
                    <Button onClick={() => setOpen(false)}>キャンセル</Button>
                    <Button onClick={() => { onConfirm(shift, reason); setOpen(false); }} disabled={!reason}>
                        削除を確定
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
