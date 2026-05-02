//portal/shift-coordinate
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { extractFilterOptions, ShiftFilterOptions } from "@/lib/supabase/shiftFilterOptions";
import type { SupabaseShiftRaw, ShiftData } from "@/types/shift";
import { format, parseISO } from "date-fns";
import { ja } from 'date-fns/locale';
import ShiftCard from "@/components/shift/ShiftCard";
import GroupAddButton from "@/components/shift/GroupAddButton";
import { createTimeAdjustAlertFromShift } from "@/lib/shift/shift_card_alert";


const PAGE_SIZE = 100;


export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [filteredShifts, setFilteredShifts] = useState<ShiftData[]>([]);
    const [accountId, setAccountId] = useState<string>("");
    const [kaipokeUserId, setKaipokeUserId] = useState<string>(""); // 追加
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

    // --- 型: 割当APIの返却 ---
    type AssignResult = {
        status: 'assigned' | 'replaced' | 'error' | 'noop';
        slot?: 'staff_01' | 'staff_02' | 'staff_03';
        message?: string;
    };

    type ShiftAssignApiResponse =
        | { ok: true; assign: AssignResult; stages?: unknown }
        | { ok?: false; error: string; assign?: AssignResult; stages?: unknown };

    // --- ユーティリティ: JSONを安全にパース ---

    useEffect(() => {
        const fetchData = async () => {
            const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id, kaipoke_user_id")
                .eq("auth_user_id", user.id)
                .single();
            setAccountId(userRecord?.user_id || "");
            setKaipokeUserId(userRecord?.kaipoke_user_id || "");

            const allShifts: SupabaseShiftRaw[] = [];
            for (let i = 0; i < 10; i++) {
                const { data, error } = await supabase
                    .from("shift_self_coordinate_card_view")
                    .select("*")
                    .gte("shift_start_date", jstNow)
                    .range(i * 1000, (i + 1) * 1000 - 1);

                if (error || !data?.length) break;
                allShifts.push(...data);
            }

            //alert("allShifts length:" + allShifts?.length);

            const { data: postalDistricts } = await supabase
                .from("postal_district")
                .select("postal_code_3, district")
                .order("postal_code_3");

            if (!allShifts) return;

            const formatted = (allShifts as SupabaseShiftRaw[])
                .filter((s) =>
                    s.staff_01_user_id === "-" ||                         // 既存の特例を維持
                    s.level_sort_order < 4_000_000 ||                    // staff_01 のレベル基準（既存）
                    ((s.staff_02_level_sort ?? Number.MAX_SAFE_INTEGER) < 4_000_000 && s.staff_02_attend_flg === false) || // 追加：02
                    ((s.staff_03_level_sort ?? Number.MAX_SAFE_INTEGER) < 4_000_000 && s.staff_03_attend_flg === false)    // 追加：03
                )
                .map((s): ShiftData => ({
                    id: String(s.id ?? s.shift_id),
                    shift_id: s.shift_id,
                    shift_start_date: s.shift_start_date,
                    shift_start_time: s.shift_start_time,
                    shift_end_time: s.shift_end_time,
                    service_code: s.service_code,
                    kaipoke_cs_id: s.kaipoke_cs_id,
                    staff_01_user_id: s.staff_01_user_id,
                    staff_02_user_id: s.staff_02_user_id,
                    staff_03_user_id: s.staff_03_user_id,
                    staff_01_level_sort: s.staff_01_level_sort,
                    staff_02_level_sort: s.staff_01_level_sort,
                    staff_03_level_sort: s.staff_01_level_sort,
                    address: s.address || "",
                    postal_code: s.postal_code || "",
                    estimated_pay_amount:
                        typeof s.estimated_pay_amount === "number"
                            ? s.estimated_pay_amount
                            : null,
                    client_name: s.name || "",
                    gender_request_name: s.gender_request_name || "",
                    male_flg: s.male_flg || false,
                    female_flg: s.female_flg || false,
                    postal_code_3: s.postal_code_3 || "",
                    district: s.district || "",
                    require_doc_group: (typeof s.require_doc_group === "string" && s.require_doc_group.trim() !== "")
                        ? s.require_doc_group
                        : null,
                }));

            //alert("filtered shiftData before map:" + formatted.length);

            const sorted = formatted.sort((a, b) => {
                const d1 = a.shift_start_date + a.shift_start_time;
                const d2 = b.shift_start_date + b.shift_start_time;
                if (d1 !== d2) return d1.localeCompare(d2);
                if (a.postal_code_3 !== b.postal_code_3) return a.postal_code_3.localeCompare(b.postal_code_3);
                return a.client_name.localeCompare(b.client_name);
            });

            //alert("sorted length:" + sorted.length);

            const { data: csInfoData } = await supabase
                .from("cs_kaipoke_info")
                .select("kaipoke_cs_id, name, commuting_flg, standard_route, standard_trans_ways, standard_purpose, biko")
                .in("kaipoke_cs_id", formatted.map(f => f.kaipoke_cs_id));

            const csInfoMap = new Map(csInfoData?.map(info => [info.kaipoke_cs_id, info]) ?? []);

            const merged = formatted.map(shift => {
                const csInfo = csInfoMap.get(shift.kaipoke_cs_id);
                return {
                    ...shift,
                    cs_name: csInfo?.name ?? '',
                    commuting_flg: csInfo?.commuting_flg ?? false,
                    standard_route: csInfo?.standard_route ?? '',
                    standard_trans_ways: csInfo?.standard_trans_ways ?? '',
                    standard_purpose: csInfo?.standard_purpose ?? '',
                    biko: csInfo?.biko ?? '',
                };
            });
            setShifts(merged);
            setFilteredShifts(merged);

            //setShifts(sorted);
            //setFilteredShifts(sorted);
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

    const handleShiftRequest = async (
        shift: ShiftData,
        attendRequest: boolean,
        timeAdjustNote?: string
    ) => {
        setCreatingShiftRequest(true);
        try {
            const session = await supabase.auth.getSession();
            const userId = session.data?.session?.user?.id;
            if (!userId) {
                alert("ログイン情報が取得できません");
                return;
            }

            if (!accountId) {
                alert("ユーザーIDを取得できていません。数秒後に再度お試しください。");
                return;
            }

            // --- 既存：RPAリクエスト作成（変更なし） ---
            const { error } = await supabase.from("rpa_command_requests").insert({
                template_id: "92932ea2-b450-4ed0-a07b-4888750da641",
                requester_id: userId,
                approver_id: userId,
                status: "approved",
                request_details: {
                    shift_id: shift.shift_id,
                    kaipoke_cs_id: shift.kaipoke_cs_id,
                    shift_start_date: shift.shift_start_date,
                    shift_start_time: shift.shift_start_time,
                    service_code: shift.service_code,
                    postal_code_3: shift.postal_code_3,
                    client_name: shift.client_name,
                    requested_by: accountId,            // ← users.user_id（社内ID）
                    requested_kaipoke_user_id: kaipokeUserId,
                    attend_request: attendRequest,
                    // 任意メモ
                    time_adjust_note: timeAdjustNote ?? null,
                },
            });

            if (error) {
                alert("送信に失敗しました: " + error.message);
            } else {
                alert("希望リクエストを登録しました！");

                // --- 既存：LW通知（変更なし） ---
                const { data: chanData } = await supabase
                    .from("group_lw_channel_view")
                    .select("channel_id")
                    .eq("group_account", shift.kaipoke_cs_id)
                    .maybeSingle();

                const { data: userData } = await supabase
                    .from("user_entry_united_view_single")
                    .select("lw_userid, last_name_kanji, first_name_kanji")
                    .eq("auth_user_id", userId)
                    .limit(1)
                    .single();

                const sender = userData?.lw_userid;
                const mention = sender ? `<m userId="${sender}">さん` : `${sender ?? "不明"}さん`;

                if (chanData?.channel_id) {
                    const message = `✅シフト希望が登録されました\n\n・マイファミーユ反映までお待ちください\n\n・日付: ${shift.shift_start_date}\n・時間: ${shift.shift_start_time}～${shift.shift_end_time}\n・利用者: ${shift.client_name} 様\n・種別: ${shift.service_code}\n・エリア: ${shift.postal_code_3}（${shift.district}）\n・同行希望: ${attendRequest ? "あり" : "なし"}\n・担当者: ${mention}`;

                    await fetch("/api/lw-send-botmessage", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ channelId: chanData.channel_id, text: message }),
                    });
                } else {
                    console.warn("チャネルIDが取得できませんでした");
                }

                // 既存：RPA成功の直後に shift 割当 API を呼ぶ（ログ付き）
                try {
                    // ★追加：traceId を発行して3者（ブラウザ/Vercel/DB）で突合
                    const traceId = crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`;
                    console.log("[SHIFT ASSIGN] start", {
                        traceId,
                        shift_id: shift.shift_id,
                        requested_by_user_id: accountId,
                        accompany: attendRequest,
                    });

                    const resp = await fetch("/api/shift-assign-after-rpa", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-trace-id": traceId },  // ★追加
                        body: JSON.stringify({
                            shift_id: shift.shift_id,
                            requested_by_user_id: accountId, // ※ users.user_id（社内ID）
                            accompany: attendRequest,
                            role_code: null,
                            trace_id: traceId, // （任意）本文にも入れておく
                        }),
                    });

                    // ★追加：HTTPステータス＆生テキストを必ずログ（404/500の切り分け用）
                    const raw = await resp.text();
                    console.log("[SHIFT ASSIGN] http", { traceId, status: resp.status, ok: resp.ok, raw });

                    let payload: ShiftAssignApiResponse | null = null;
                    try { payload = JSON.parse(raw) as ShiftAssignApiResponse; } catch { }
                    console.log("[SHIFT ASSIGN] payload", { traceId, payload });

                    if (resp.ok && payload && "assign" in payload && payload.assign) {
                        const { status, slot, message } = payload.assign;
                        void slot
                        void message
                        //alert(`🧩 Shift割当結果: ${status}${slot ? ` / ${slot}` : ""}${message ? `\n${message}` : ""}`);
                        // --- ★追加: LINE WORKS へ担当変更通知 ---
                        try {
                            if (status === "assigned" || status === "replaced") {
                                if (chanData?.channel_id) {
                                    const toHM = (t?: string | null) => (t ? t.slice(0, 5) : "");
                                    // mention はすでに上で作っている `const mention = ...` を再利用
                                    const text =
                                        `${shift.shift_start_date} ${toHM(shift.shift_start_time)}～${toHM(shift.shift_end_time)} のシフトの担当を${mention}に変更しました（マイファミーユ）。\n` +
                                        `変更に問題がある場合には、マネジャーに問い合わせください。`;

                                    await fetch("/api/lw-send-botmessage", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ channelId: chanData.channel_id, text }),
                                    });
                                } else {
                                    console.warn("チャネルIDが取得できませんでした（担当変更通知）");
                                }
                            }
                        } catch (e) {
                            console.warn("担当変更通知の送信に失敗", e);
                        }


                    } else {
                        const errMsg =
                            payload && "error" in payload && typeof payload.error === "string"
                                ? payload.error
                                : `HTTP ${resp.status}`;
                        alert(`※シフト割当は未反映: ${errMsg}`);
                    }
                } catch (e) {
                    console.error("[SHIFT ASSIGN] exception", e);
                    alert("※シフト割当の呼び出しで例外が発生しました");
                }

                // --- ★追加ここまで ---

                // 5) 時間調整のアラートも作成（cs_kaipoke_info.name を優先）
                await createTimeAdjustAlertFromShift(
                    {
                        shift_id: shift.shift_id,
                        kaipoke_cs_id: shift.kaipoke_cs_id,
                        shift_start_date: shift.shift_start_date,
                        shift_start_time: shift.shift_start_time,
                        client_name: shift.client_name,
                    },
                    timeAdjustNote
                );
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
            <h2 className="text-xl font-bold mb-4">シフ子（ｼﾌﾄｺｰﾃﾞｨﾈｰﾄ：自分で好きなシフトを取れます）</h2>

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
            {/* 希望送信ウィジェット追加 */}
            <ShiftWishWidget filterOptions={filterOptions} />

            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                表示している「概算給与」は、基本時給・サービス加算・回ごと単価・通勤費から算出した目安です。
                実際の給与は、個人別時給、同日に複数サービスへ入る場合の移動時間加算等により変動します。
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {paginatedShifts.map((shift) => (
                    <ShiftCard
                        key={shift.shift_id}
                        shift={shift}
                        mode="request"
                        creatingRequest={creatingShiftRequest}
                        onRequest={(attend, note) => handleShiftRequest(shift, attend, note)}
                        extraActions={<GroupAddButton shift={shift} />}
                    />
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


function ShiftWishWidget({
    filterOptions,
}: {
    filterOptions: Pick<ShiftFilterOptions, "postalOptions" | "dateOptions">;
}) {
    const [requestType, setRequestType] = useState<"spot" | "regular">("spot");
    const [selectedDateOrWeekday, setSelectedDateOrWeekday] = useState<string[]>([]); // 複数選択を配列に変更
    const [startHour, setStartHour] = useState(9);
    const [endHour, setEndHour] = useState(12);
    const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const session = await supabase.auth.getSession();
            const userId = session.data?.session?.user?.id;
            if (!userId) {
                alert("ログインが必要です");
                return;
            }

            // エリア情報のJSON形式
            const areaJson = selectedAreas.map((code) => {
                const match = filterOptions.postalOptions.find((p) => p.postal_code_3 === code);
                return { postal_code_3: code, district: match?.district ?? "" };
            });

            const isSpot = requestType === "spot";
            const payload = {
                user_id: userId,
                request_type: requestType,
                // 複数選択された日付や曜日をjsonbとして格納
                preferred_date: isSpot ? selectedDateOrWeekday : null, // 複数日付選択
                preferred_weekday: !isSpot ? selectedDateOrWeekday.map(Number) : null, // 複数曜日選択
                time_start_hour: startHour,
                time_end_hour: endHour,
                postal_area_json: areaJson,
            };

            const { error } = await supabase.from("shift_wishes").insert(payload);

            if (error) {
                alert("送信失敗: " + error.message);
            } else {
                alert("✅ シフト希望を送信しました！");
            }
        } catch (e) {
            alert("送信中にエラーが発生しました");
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-6">
            <p className="text-sm text-gray-800 mb-2 font-semibold">
                シフトWish：シフ子に無いけど、もっとシフトに入りたい。入れるエリア・時間があるよ！　という方はぜひ教えてください。マネジャーがケアマネ・相談員へ掛け合います。
            </p>

            {/* 種別 */}
            <div className="mb-2 text-sm">
                <label className="mr-4">
                    <input
                        type="radio"
                        checked={requestType === "regular"}
                        onChange={() => setRequestType("regular")}
                    /> レギュラー希望（曜日指定：複数選択可能）
                </label>
                <label>
                    <input
                        type="radio"
                        checked={requestType === "spot"}
                        onChange={() => setRequestType("spot")}
                    /> スポット希望（特定日：複数選択可能）
                </label>
            </div>

            {/* 日付 or 曜日選択 */}
            {requestType === "spot" ? (
                <select
                    multiple
                    value={selectedDateOrWeekday}
                    onChange={(e) => setSelectedDateOrWeekday(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="border rounded px-2 py-1 mb-2"
                >
                    <option value="">-- 日付を選択 --</option>
                    {filterOptions.dateOptions.map((dateStr) => {
                        const weekday = format(parseISO(dateStr), "(E)", { locale: ja });
                        const display = format(parseISO(dateStr), "M/d") + weekday;
                        return (
                            <option key={dateStr} value={dateStr}>
                                {display}
                            </option>
                        );
                    })}
                </select>
            ) : (
                <select
                    multiple
                    value={selectedDateOrWeekday}
                    onChange={(e) => setSelectedDateOrWeekday(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="border rounded px-2 py-1 mb-2"
                >
                    <option value="">-- 曜日を選択 --</option>
                    <option value="0">日曜日</option>
                    <option value="1">月曜日</option>
                    <option value="2">火曜日</option>
                    <option value="3">水曜日</option>
                    <option value="4">木曜日</option>
                    <option value="5">金曜日</option>
                    <option value="6">土曜日</option>
                </select>
            )}

            {/* 時間枠 */}
            <div className="mb-2 text-sm flex gap-2">
                <label>時間帯（複数選択可能）:</label>
                <select
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    className="border rounded px-2 py-1"
                >
                    {[...Array(24)].map((_, i) => (
                        <option key={i} value={i}>{i}時</option>
                    ))}
                </select>
                ～
                <select
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    className="border rounded px-2 py-1"
                >
                    {[...Array(24)].map((_, i) => (
                        <option key={i} value={i}>{i}時</option>
                    ))}
                </select>
            </div>

            {/* エリア */}
            <div className="mb-2 text-sm">
                <label>希望エリア（複数選択可能）:</label>
                <select
                    multiple
                    value={selectedAreas}
                    onChange={(e) => setSelectedAreas(Array.from(e.target.selectedOptions, o => o.value))}
                    className="w-full border rounded p-1 h-[6rem]"
                >
                    {filterOptions.postalOptions.map((p) => (
                        <option key={p.postal_code_3} value={p.postal_code_3}>
                            {p.postal_code_3}（{p.district}）
                        </option>
                    ))}
                </select>
            </div>

            {/* Submit */}
            <div className="mt-3">
                <Button onClick={handleSubmit} disabled={submitting} className="bg-green-600 text-white hover:bg-green-700">
                    {submitting ? "送信中..." : "Wishを送る"}
                </Button>
            </div>

            <div className="text-xs text-gray-500 mt-2">
                👉 <a href="https://board.worksmobile.com/main/board/4090000000109323447?t=56469" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
                    新規案件も確認してみてください
                </a>
            </div>
        </div>
    );
}
