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

const PAGE_SIZE = 50;

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [filteredShifts, setFilteredShifts] = useState<ShiftData[]>([]);
    const [selectedShift, setSelectedShift] = useState<ShiftData | null>(null);
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
                .filter((s) => s.staff_01_user_id === null || (s.level_sort_order !== undefined && s.level_sort_order < 5000000))
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

    const handleShiftRequest = async () => {
        if (!selectedShift) return;

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
                    kaipoke_cs_id: selectedShift.kaipoke_cs_id,
                    shift_start_date: selectedShift.shift_start_date,
                    shift_start_time: selectedShift.shift_start_time,
                    service_code: selectedShift.service_code,
                    postal_code_3: selectedShift.postal_code_3,
                    client_name: selectedShift.client_name,
                    requested_by: userId,
                },
            });

            if (error) {
                alert("送信に失敗しました: " + error.message);
            } else {
                alert("希望リクエストを登録しました！");
                setSelectedShift(null);
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                <div>
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
                </div>

                <div>
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
                </div>

                <div>
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
                </div>

                <div>
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
                </div>

                <div>
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
                </div>
                <div className="col-span-3 flex gap-2">
                    <Button onClick={applyFilters} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        フィルターを適用
                    </Button>
                    <Button onClick={clearFilters} className="w-full bg-gray-400 hover:bg-gray-500 text-white">
                        フィルター解除
                    </Button>
                </div>
            </div>

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
                            <div className="text-sm">利用者名: {shift.client_name}</div>
                            <div className="text-sm">性別希望: {shift.gender_request_name}</div>
                            <ShiftRequestDialog
                                onConfirm={handleShiftRequest}
                                creating={creatingShiftRequest}
                            />
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
}: {
    onConfirm: () => void;
    creating: boolean;
}) {
    const [open, setOpen] = useState(false);

    const handleCancel = () => setOpen(false);
    const handleConfirm = () => {
        onConfirm();
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => setOpen(true)}>このシフトを希望する</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>このシフトを希望しますか？</DialogTitle>
                <DialogDescription>希望を送信すると、RPA申請が開始されます。</DialogDescription>
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
