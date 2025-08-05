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
void parseISO;
import { ShiftData } from "@/types/shift";  // typesディレクトリがある場合

const PAGE_SIZE = 500;

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]); // ShiftData 型を使用
    const [currentPage, setCurrentPage] = useState(1);
    const [currentDate, setCurrentDate] = useState<string>("");
    const [userId, setUserId] = useState<string>(""); // auth_user_idを基にユーザーIDを設定
    void userId;
    const [shiftDate, setShiftDate] = useState<Date>(new Date());  // シフトの日付

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // auth_user_id を使って users テーブルの user_id を取得
            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id")
                .eq("auth_user_id", user.id) // ここで auth_user_id を使ってユーザーIDを取得
                .single();

            if (userRecord?.user_id) {
                setUserId(userRecord.user_id); // user_id（例えば、'junkusano'）を設定

                const formattedDate = format(shiftDate, "yyyy-MM-dd");
                setCurrentDate(format(shiftDate, "Y年M月d日")); // シフト表示用の日付

                //alert("user_id:"+userRecord.user_id);
                //alert("yyyy-mm-dd:"+formattedDate);

                // シフトデータをユーザーIDでフィルタリング
                // ユーザーIDでフィルタリング
                const { data: shiftsData, error } = await supabase
                    .from("shift_csinfo_postalname_view")
                    .select("*")
                    .or(
                        `staff_01_user_id.eq.${user.id},staff_02_user_id.eq.${user.id},staff_03_user_id.eq.${user.id}`
                    )  // どれかのスタッフがログインユーザーのIDに一致するシフトを取得
                    .eq("shift_start_date", formattedDate)  // 特定の日付のシフトを取得
                    .order("shift_start_time", { ascending: true });

                setShifts(shiftsData || []);
            }
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

function GroupAddButton({ shift }: { shift: ShiftData }) {
    const [processing, setProcessing] = useState(false); // 処理中の状態
    const [open, setOpen] = useState(false); // モーダルの状態
    const [errorMessage, setErrorMessage] = useState(""); // エラーメッセージ

    const handleConfirm = async () => {
        setProcessing(true);
        try {
            // ログインユーザーの情報取得
            const session = await supabase.auth.getSession();
            const userId = session.data?.session?.user?.id;

            if (!userId) {
                alert("ログイン情報が取得できません");
                return;
            }

            // LINE WORKS グループIDを取得（ここは仮の処理。実際の値を取得する方法に変更が必要）
            const { data: chanData, error } = await supabase
                .from("group_lw_channel_view")
                .select("group_id")
                .eq("group_account", shift.kaipoke_cs_id) // 何らかの条件でグループIDを取得
                .maybeSingle();

            if (error || !chanData?.group_id) {
                throw new Error("グループ情報が取得できません");
            }

            // ユーザー情報を取得
            const { data: userData } = await supabase
                .from("user_entry_united_view")
                .select("lw_userid")
                .eq("auth_user_id", userId)
                .maybeSingle();

            const senderId = userData?.lw_userid;
            if (!senderId) throw new Error("ユーザー情報が取得できません");

            // グループにユーザーを追加するAPIリクエスト
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
            setOpen(false); // 処理が完了したらモーダルを閉じる
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="mt-2 text-xs flex items-center gap-1 px-2 py-1 border border-gray-400 rounded hover:bg-gray-100">
                    <img src="/8aeeac38-ce77-4c97-b2e9-2fcd97c5ed4a.jpg" alt="LW" width={16} height={16} />
                    <span>グループ追加</span>
                </button>
            </DialogTrigger>

            <DialogContent>
                <DialogTitle>グループ追加確認</DialogTitle>
                <DialogDescription>
                    {shift.client_name} 様の情報連携グループにメンバー追加しますか？
                </DialogDescription>

                {errorMessage && (
                    <div className="text-red-500 text-sm mt-2">{errorMessage}</div>
                )}

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
