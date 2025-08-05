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
import { ShiftData } from "@/types/shift";  // typesディレクトリがある場合

const PAGE_SIZE = 500;

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [filteredShifts, setFilteredShifts] = useState<ShiftData[]>([]);
    const [accountId, setAccountId] = useState<string>("");
    const [kaipokeUserId, setKaipokeUserId] = useState<string>("");
    const [currentPage, setCurrentPage] = useState(1);
    const [shiftDate, setShiftDate] = useState<Date>(new Date());  // シフトの日付
    const [currentDate, setCurrentDate] = useState<string>("");

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id, kaipoke_user_id")
                .eq("auth_user_id", user.id)
                .single();
            setAccountId(userRecord?.user_id || "");
            setKaipokeUserId(userRecord?.kaipoke_user_id || "");

            const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

            // user_id を使ってシフトをフィルタリング
            const { data: shiftsData } = await supabase
                .from("shift") // 使用するテーブル名を修正
                .select("*")
                .or(`staff_01_user_id.eq.${userRecord?.user_id},staff_02_user_id.eq.${userRecord?.user_id},staff_03_user_id.eq.${userRecord?.user_id}`) // user_id でフィルタリング
                .gte("shift_start_date", jstNow)  // 現在日付以降のシフトを取得
                .order("shift_start_time", { ascending: true });

            setShifts(shiftsData || []);
            setFilteredShifts(shiftsData || []);

            setCurrentDate(format(shiftDate, "Y年M月d日")); // 日付の表示
        };

        fetchData();
    }, [shiftDate]); // shiftDateが変更されたときに再取得

    // 前の日
    const handlePrevDay = () => {
        const newDate = subDays(shiftDate, 1);
        setShiftDate(newDate);
        setCurrentPage(1);  // ページをリセット
    };

    // 次の日
    const handleNextDay = () => {
        const newDate = addDays(shiftDate, 1);
        setShiftDate(newDate);
        setCurrentPage(1);  // ページをリセット
    };

    // ページネーション
    const start = (currentPage - 1) * PAGE_SIZE;
    const paginatedShifts = filteredShifts.slice(start, start + PAGE_SIZE);

    return (
        <div className="content">
            <h2 className="text-xl font-bold mb-4">{currentDate || "シフト"} シフト</h2>

            <div className="flex justify-between mb-4">
                <Button onClick={handlePrevDay} disabled={currentPage === 1}>
                    前の日
                </Button>
                <Button onClick={handleNextDay} disabled={start + PAGE_SIZE >= shifts.length}>
                    次の日
                </Button>
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
                        <CardContent className="p-4">
                            <div className="text-sm font-semibold">
                                {shift.shift_start_date} {shift.shift_start_time}～{shift.shift_end_time}
                            </div>
                            <div className="text-sm">種別: {shift.service_code}</div>
                            <div className="text-sm">郵便番号: {shift.address}</div>
                            <div className="text-sm">エリア: {shift.district}</div>
                            <div className="text-sm">
                                利用者名: {shift.client_name} 様
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
                                <GroupAddButton shift={shift} />
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}

            <div className="flex justify-between mt-6">
                <Button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
                    戻る
                </Button>
                <Button
                    disabled={start + PAGE_SIZE >= filteredShifts.length}
                    onClick={() => setCurrentPage(currentPage + 1)}
                >
                    次へ
                </Button>
            </div>
        </div>
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
                    グループ追加
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
