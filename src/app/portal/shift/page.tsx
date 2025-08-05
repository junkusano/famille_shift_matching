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
import { format, parseISO, addDays, subDays } from "date-fns";
import { ShiftData } from "@/types/shift";  // typesディレクトリがある場合

const PAGE_SIZE = 500;

export default function ShiftPage() {
    void parseISO;
    const [shifts, setShifts] = useState<ShiftData[]>([]); // ShiftData 型を使用
    const [currentPage, setCurrentPage] = useState(1);
    const [currentDate, setCurrentDate] = useState<string>("");

    // ユーザーIDの取得
    const [userId, setUserId] = useState<string>("");
    void userId;
    const [shiftDate, setShiftDate] = useState<Date>(new Date());  // シフトの日付

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setUserId(user.id); // ログインユーザーIDを設定

            // `user_id` を `users` テーブルから取得する
            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id")
                .eq("auth_user_id", user.id)
                .single();

            if (userRecord?.user_id) {
                // `user_id` を利用してシフトを取得
                const formattedDate = format(shiftDate, "yyyy-MM-dd");
                setCurrentDate(format(shiftDate, "M月d日")); // シフト表示用の日付

                const { data: shiftsData } = await supabase
                    .from("shifts")
                    .select("*")
                    .or(`shift_01_user_id.eq.${userRecord.user_id},shift_02_user_id.eq.${userRecord.user_id},shift_03_user_id.eq.${userRecord.user_id}`)
                    .eq("shift_start_date", formattedDate)  // 特定の日付のシフトを取得
                    .order("shift_start_time", { ascending: true });

                setShifts(shiftsData || []);
            }
        };

        fetchData();
    }, [shiftDate]); // shiftDateが変わるたびに再取得

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
    const paginatedShifts = shifts.slice(start, start + PAGE_SIZE);

    const handleShiftRequest = async (shift: ShiftData, attendRequest: boolean) => {
        const session = await supabase.auth.getSession();
        const userId = session.data?.session?.user?.id;
        if (!userId) {
            alert("ログイン情報が取得できません");
            return;
        }

        await supabase.from("shift_requests").insert({
            shift_id: shift.shift_id,
            user_id: userId,
            attend_request: attendRequest,
        });

        alert("シフト希望を登録しました！");
    };

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
            <h2 className="text-xl font-bold mb-4">{currentDate || "シフト"} シフト</h2> {/* 現在のシフトが空の場合でも表示 */}

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
                        <CardContent>
                            <div className="text-sm font-semibold">
                                {shift.shift_start_date} {shift.shift_start_time}～{shift.shift_end_time}
                            </div>
                            <div className="text-sm">利用者: {shift.client_name}</div>
                            <div className="text-sm">エリア: {shift.address}</div>

                            <div className="flex gap-2 mt-4">
                                <ShiftRequestDialog shift={shift} onConfirm={handleShiftRequest} />
                                <ShiftDeleteDialog shift={shift} onConfirm={handleShiftDelete} />
                            </div>
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

function ShiftRequestDialog({
    shift,
    onConfirm
}: {
    shift: ShiftData;
    onConfirm: (shift: ShiftData, attendRequest: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const [attendRequest, setAttendRequest] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => setOpen(true)}>このシフトを希望する</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>シフト希望</DialogTitle>
                <DialogDescription>
                    {shift.client_name} 様のシフトを希望しますか？
                    <label className="flex items-center mt-2">
                        <input
                            type="checkbox"
                            checked={attendRequest}
                            onChange={(e) => setAttendRequest(e.target.checked)}
                        />
                        同行希望
                    </label>
                </DialogDescription>
                <div className="flex justify-end gap-2 mt-4">
                    <Button onClick={() => setOpen(false)}>キャンセル</Button>
                    <Button onClick={() => onConfirm(shift, attendRequest)}>希望を送信</Button>
                </div>
            </DialogContent>
        </Dialog>
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
