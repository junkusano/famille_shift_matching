//portal/user_advance_payment_applications/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LoginUser = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  department?: string | null;
  role?: string | null;
  created_at?: string | null;
  has_social_insurance?: boolean;
  has_employment_insurance?: boolean;
  has_employee_loan?: boolean;
};

type ShiftRow = {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string | null;
  kaipoke_cs_id: string | null;
  name: string | null;
  district: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  estimated_pay_amount: number | null;
};

type TargetShift = {
  id: string;
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  client_name: string;
  address: string;
  service_code: string;
  amount: number;
  excludedAmount: number;
  record_status: string | null;
  has_shift_record: boolean;
};

type RejectedApplication = {
  id: number;
  application_no: string;
  status: string;
  rejected_reason: string | null;
  created_at: string;
};

type ConfirmKey =
  | "shiftConfirmed"
  | "feeAccepted"
  | "insuranceAccepted";

const confirmItems: Array<{ key: ConfirmKey; label: string; description: string }> = [
  {
    key: "shiftConfirmed",
    label: "表示されているシフト内容に相違がないことを確認しました。",
    description: "対象シフトの日付・時間・利用者情報を確認したうえで申請します。",
  },
  {
    key: "feeAccepted",
    label: "振込にかかる手数料として200円が差し引かれることを了承しました。",
    description: "振込額から事務・振込手数料相当額として200円を差し引きます。",
  },
  {
    key: "insuranceAccepted",
    label: "加入保険の状況により、振込可能額が変動する場合があることを了承しました。",
    description: "申請可能額は、社会保険・雇用保険等の加入状況、社員貸付の有無により減額される場合があります。複数条件に該当する場合は、それぞれ10%ずつ控除され、最大30%控除後の金額が申請上限額となります。日払いで控除された費用については概算の金額のため給与支給日に精算されます",
  },
];

function toJstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getTargetWindowJst() {
  const today = toJstDateString();

  const yesterdayDate = new Date(`${today}T00:00:00+09:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  const yesterday = toJstDateString(yesterdayDate);

  const start = makeJstDateTime(yesterday, "18:00");
  const end = makeJstDateTime(today, "18:00");

  return { start, end };
}

function makeJstDateTime(date: string, time: string) {
  const safeTime = (time || "00:00").slice(0, 5);
  return new Date(`${date}T${safeTime}:00+09:00`);
}

function formatTime(time: string) {
  return (time || "").slice(0, 5);
}

function calculateAvailableAmount(params: {
  baseAmount: number;
  hasSocialInsurance: boolean;
  hasEmploymentAndWorkersInsurance: boolean;
  hasEmployeeLoan: boolean;
}) {
  let deductionRate = 0.1;
  const reasons: string[] = ["一律控除"];

  if (
    params.hasSocialInsurance ||
    params.hasEmploymentAndWorkersInsurance
  ) {
    deductionRate += 0.1;
    reasons.push("社会保険または雇用保険加入");
  }

  if (params.hasEmployeeLoan) {
    deductionRate += 0.1;
    reasons.push("社員貸付あり");
  }

  const availableAmount = Math.floor(
    params.baseAmount * (1 - deductionRate)
  );

  return {
    deductionRate,
    availableAmount,
    reasons,
  };
}

function makeApplicationNo() {
  const today = toJstDateString().replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `AP-${today}-${random}`;
}

export default function UserAdvancePaymentConfirmPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [me, setMe] = useState<LoginUser | null>(null);
  const [targetShifts, setTargetShifts] = useState<TargetShift[]>([]);
  const [checks, setChecks] = useState<Record<ConfirmKey, boolean>>({
    shiftConfirmed: false,
    feeAccepted: false,
    insuranceAccepted: false,
  });
  const [message, setMessage] = useState("");

  const [performanceRank, setPerformanceRank] =
    useState("bronze");

  const [errorMessage, setErrorMessage] = useState("");
  const [rejectedApplication, setRejectedApplication] =
    useState<RejectedApplication | null>(null);
  const { start, end } = useMemo(() => getTargetWindowJst(), []);

  const now = new Date();
  const currentTime = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).slice(0, 5);

  const isAfterDeadline = currentTime > "18:30";
  //const isAfterDeadline = currentTime > "21:00";

  const allChecked = confirmItems.every((item) => checks[item.key]);
  const hasSelectedShift = targetShifts.length > 0;

  const joinedAt = me?.created_at ? new Date(me.created_at) : null;

  const oneMonthAfterJoinedAt = joinedAt
    ? new Date(joinedAt)
    : null;

  if (oneMonthAfterJoinedAt) {
    oneMonthAfterJoinedAt.setMonth(oneMonthAfterJoinedAt.getMonth() + 1);
  }

  const isWithinOneMonthFromJoin =
    oneMonthAfterJoinedAt
      ? new Date() < oneMonthAfterJoinedAt
      : false;

  const isSilverOrHigher =
    isWithinOneMonthFromJoin ||
    performanceRank === "silver" ||
    performanceRank === "gold" ||
    performanceRank === "platinum";

  const isManager =
    me?.role === "manager" || me?.role === "admin";

  const isTestAccount = me?.user_id === "servicesuport";

  const canSubmit =
    isTestAccount ||
    (
      isSilverOrHigher &&
      !isManager &&
      !isAfterDeadline &&
      hasSelectedShift &&
      allChecked &&
      !submitting
    );


  const baseAmount = targetShifts
    .reduce((sum, shift) => sum + shift.amount, 0);

  const eligibleAmount = targetShifts
    .filter((shift) => shift.has_shift_record)
    .reduce((sum, shift) => sum + shift.amount, 0);

  const excludedAmount = targetShifts
    .filter((shift) => !shift.has_shift_record)
    .reduce((sum, shift) => sum + shift.amount, 0);

  const calculation = calculateAvailableAmount({
    baseAmount: eligibleAmount,
    hasSocialInsurance: Boolean(me?.has_social_insurance),
    hasEmploymentAndWorkersInsurance: Boolean(
      me?.has_employment_insurance
    ),
    hasEmployeeLoan: Boolean(
      me?.has_employee_loan
    ),
  });

  useEffect(() => {
    async function fetchTargetShifts() {
      try {
        setLoading(true);
        setErrorMessage("");
        setMessage("");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          setErrorMessage("ログイン情報を取得できませんでした。再ログインしてください。");
          return;
        }

        const { data: loginUser, error: userError } = await supabase
          .from("users")
          .select("user_id, role, created_at, has_social_insurance,has_employment_insurance,has_employee_loan")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (userError) throw userError;
        if (!loginUser?.user_id) {
          setErrorMessage("ログインユーザーの user_id を取得できませんでした。");
          return;
        }

        const currentUser = loginUser as LoginUser;
        setMe(currentUser);

        const { data: rejectedData } = await supabase
          .from("user_advance_payment_applications")
          .select("*")
          .eq("user_id", currentUser.user_id)
          .eq("status", "rejected")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setRejectedApplication(rejectedData);


        const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

        const { data: latestScore } = await supabase
          .from("staff_monthly_score_summaries")
          .select("medal_rank")
          .eq("user_id", currentUser.user_id)
          .eq("target_month", currentMonth)
          .maybeSingle();

        setPerformanceRank(latestScore?.medal_rank ?? "bronze");


        const startDate = new Date(start.getTime() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const endDate = end.toISOString().slice(0, 10);

        const { data, error } = await supabase
          .from("shift_self_coordinate_card_view")
          .select(`
            shift_id,
            shift_start_date,
            shift_start_time,
            shift_end_time,
            service_code,
            estimated_pay_amount,
            kaipoke_cs_id,
            name,
            district,
            staff_01_user_id,
            staff_02_user_id,
            staff_03_user_id
          `)
          .not("service_code", "eq", "99999999")

          .gte("shift_start_date", startDate)
          .lte("shift_start_date", endDate)
          .or(
            `staff_01_user_id.eq.${currentUser.user_id},staff_02_user_id.eq.${currentUser.user_id},staff_03_user_id.eq.${currentUser.user_id}`
          )
          .order("shift_start_date", { ascending: true })
          .order("shift_start_time", { ascending: true });

        if (error) throw error;

        const shiftIds = ((data ?? []) as ShiftRow[]).map((s) => s.shift_id);

        const { data: recordRows, error: recordError } = await supabase
          .from("shift_shift_record_view")
          .select("shift_id, record_status")
          .in("shift_id", shiftIds);

        if (recordError) throw recordError;

        const recordStatusByShiftId = new Map<string, string | null>();

        (recordRows ?? []).forEach((record) => {
          recordStatusByShiftId.set(
            record.shift_id,
            record.record_status ?? null
          );
        });

        const rows = (data ?? []) as ShiftRow[];
        const filtered = rows
          .filter((shift) => {
            const shiftEnd = makeJstDateTime(
              shift.shift_start_date,
              shift.shift_end_time
            );

            return shiftEnd > start && shiftEnd <= end;
          })
          .map((shift) => {
            const hasShiftRecord =
              recordStatusByShiftId.get(shift.shift_id) !== "draft" &&
              recordStatusByShiftId.has(shift.shift_id);

            const shiftAmount = Number(shift.estimated_pay_amount ?? 0);

            return {
              id: String(shift.shift_id),
              shift_id: shift.shift_id,
              shift_start_date: shift.shift_start_date,
              shift_start_time: shift.shift_start_time,
              shift_end_time: shift.shift_end_time,
              client_name: shift.name ?? shift.kaipoke_cs_id ?? "利用者名未設定",
              address: shift.district ?? "",
              service_code: shift.service_code ?? "",

              amount: shiftAmount,
              excludedAmount: hasShiftRecord ? 0 : shiftAmount,

              record_status: recordStatusByShiftId.get(shift.shift_id) ?? null,
              has_shift_record: hasShiftRecord,
            };
          });

        setTargetShifts(filtered);
      } catch (error) {
        console.error(error);
        const message =
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : JSON.stringify(error);

        setErrorMessage(
          `対象シフトの取得中にエラーが発生しました：${message}`
        );

      } finally {
        setLoading(false);
      }
    }

    fetchTargetShifts();
  }, [start, end]);

  async function submitApplication() {
    try {
      if (!me) {
        setErrorMessage("ログインユーザー情報を取得できていません。");
        return;
      }

      if (!isSilverOrHigher && !isTestAccount) {
        setErrorMessage(
          "日払い申請は、パフォーマンススコアがシルバー以上の方が対象です。なお、入社後1か月以内の方はこの条件の適用対象外です。"
        );
        return;
      }

      if (!canSubmit && !isTestAccount) return;

      setSubmitting(true);
      setErrorMessage("");
      setMessage("");

      const baseAmount = targetShifts
        .reduce((sum, shift) => sum + shift.amount, 0);

      const calculation = calculateAvailableAmount({
        baseAmount: eligibleAmount,
        hasSocialInsurance: Boolean(me.has_social_insurance),
        hasEmploymentAndWorkersInsurance: Boolean(
          me.has_employment_insurance
        ),
        hasEmployeeLoan: Boolean(me.has_employee_loan),
      });


      const employeeName = me.user_id;
      const applicationNo = makeApplicationNo();

      const todayJst = toJstDateString();

      const { data: existingApplication, error: existingApplicationError } =
        await supabase
          .from("user_advance_payment_applications")
          .select("id, application_no, status, created_at")
          .eq("user_id", me.user_id)
          .eq("desired_payment_date", todayJst)
          .neq("status", "rejected")
          .maybeSingle();

      if (existingApplicationError) {
        throw existingApplicationError;
      }

      if (existingApplication) {
        setMessage(
          `本日分の日払い申請はすでに登録済みです。申請番号：${existingApplication.application_no}`
        );
        return;
      }

      const { error } = await supabase.from("user_advance_payment_applications").insert({
        application_no: applicationNo,
        user_id: me.user_id,
        employee_name: employeeName || me.user_id,
        base_amount: baseAmount,
        deduction_rate: calculation.deductionRate,
        available_amount: calculation.availableAmount,
        deduction_reasons: calculation.reasons,
        amount: calculation.availableAmount,
        reason: "対象シフトに基づく日払い申請",
        desired_payment_date: toJstDateString(),
        status: "submitted",
        shift_ids: targetShifts.map((shift) => shift.shift_id),
        remarks: JSON.stringify({
          confirmation: checks,
          target_window: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
          selected_shifts: targetShifts.map((shift) => ({
            shift_id: shift.shift_id,
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            shift_end_time: shift.shift_end_time,
            client_name: shift.client_name,
          })),
        }),
      });

      if (error) throw error;

      const notifyRes = await fetch("/api/lineworks/advance-payment-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: me.user_id,
          userName: employeeName || me.user_id,
          applicationDate: toJstDateString(),
          applicationNo,

          totalAmount: baseAmount,
          excludedAmount,
          eligibleAmount,

          deductionAmount:
            eligibleAmount - calculation.availableAmount + 200,

          transferAmount:
            Math.max(calculation.availableAmount - 200, 0),

          deductionRate: calculation.deductionRate,

          deductionReasons: [
            ...calculation.reasons,
            "振込手数料200円",
          ],

          selectedShifts: targetShifts.map((shift) => ({
            shift_id: Number(shift.shift_id),
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            shift_end_time: shift.shift_end_time,
            client_name: shift.client_name,
          })),
        }),
      });

      if (!notifyRes.ok) {
        const notifyJson = await notifyRes.json().catch(() => null);
        console.error("[advance-payment-notify] failed", notifyJson);

        setMessage(
          `日払い申請は登録されました。申請番号：${applicationNo}。ただしLINE WORKS通知に失敗しました。`
        );
        return;
      }

      setMessage(`日払い申請を受け付けました。申請番号：${applicationNo}`);
    } catch (error) {
      console.error(error);
      setErrorMessage("申請の登録中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="content min-w-0 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <p className="text-sm text-slate-500">Advance Payment</p>
          <h1 className="text-2xl font-bold">日払い申請フォーム</h1>

          <div className="mt-4 text-black">
            <div className="mb-2 text-lg font-bold">
              日払い制度について
            </div>

            <p className="text-base leading-8 text-slate-800">
              この制度は、正式な給与計算・支給は翌月25日に行われることを前提とし、
              その概算を日ごとに受け取れる仕組みです。
              概算の計算には一定の時給と控除率を用いており、最終的には正式な給与支給日に、
              概算で支払われた日払い金額と、正式な給与支給額の差額が精算されることになります。
            </p>
          </div>

          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⭐</div>

              <div>
                <div className="font-semibold text-blue-900">
                  日払い申請の利用条件
                </div>

                <div className="mt-2 text-sm leading-6 text-blue-800">
                  日払い申請のご利用には、原則として
                  <span className="font-semibold">
                    パフォーマンススコア「シルバー」以上
                  </span>
                  であることが条件となります。
                  <br />
                  なお、
                  <span className="font-semibold">
                    入社後1か月以内の方
                  </span>
                  はパフォーマンススコア条件の適用対象外となります。
                </div>
              </div>
            </div>
          </div>



          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-semibold text-amber-900">
              ⏰ 申請期限について
            </div>

            <div className="mt-2 text-sm leading-relaxed text-amber-800">
              日払い申請は対象シフト実施日の
              <span className="font-semibold">18:30まで</span>
              受け付けています。
              <br />
              期限を過ぎたシフトは申請対象外となりますので、
              お早めにお手続きください。
            </div>
          </div>

        </div>

        <Card className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📅</div>

              <div>
                <div className="text-lg font-bold text-blue-900">
                  日払い対象期間
                </div>

                <div className="text-sm text-blue-700">
                  前日18:00 ～ 当日18:00終了分
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              対象シフトはログイン中の職員IDに紐づくシフトのみ表示されます。
            </div>
          </CardContent>
        </Card>

        {rejectedApplication && (
          <div className="rounded-xl border border-red-300 bg-gradient-to-r from-red-50 to-white px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>

              <div>
                <div className="text-lg font-bold text-red-700">
                  前回の申請は差し戻しされています
                </div>

                <div className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold">
                    差し戻し理由：
                  </span>
                  {rejectedApplication.rejected_reason}
                </div>

                <div className="mt-2 text-sm text-slate-500">
                  内容を修正して再申請してください。
                </div>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div>{errorMessage}</div>

            {errorMessage.includes("訪問記録") && (
              <a
                href="/portal/shift"
                className="mt-2 inline-block font-semibold underline"
              >
                シフト・訪問記録を確認する
              </a>
            )}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-green-300 bg-green-50 p-5 text-green-800 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-2xl">✅</div>

              <div>
                <div className="text-lg font-bold">
                  申請処理が完了しました
                </div>

                <div className="mt-2 text-sm leading-6">
                  {message}
                </div>
              </div>
            </div>
          </div>
        )}

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">対象シフト</h2>
                <p className="text-sm text-slate-500">
                  表示されている対象シフトが申請対象となります。
                </p>
              </div>
              <div className="text-sm text-slate-500">
                対象 {targetShifts.length}件
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">読み込み中...</div>
            ) : targetShifts.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                現在、日払い申請の対象となるシフトはありません。
              </div>
            ) : (
              <div className="space-y-3">
                {targetShifts.map((shift) => (
                  <div
                    key={shift.shift_id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition"
                  >

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                          📅 {shift.shift_start_date}
                        </div>

                        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                          ⏰ {formatTime(shift.shift_start_time)} - {formatTime(shift.shift_end_time)}
                        </div>
                      </div>

                      <div className="text-base font-semibold text-slate-900">
                        👤 {shift.client_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {shift.service_code && <span>サービスコード：{shift.service_code}</span>}
                        {shift.service_code && shift.address && <span> ／ </span>}
                        {shift.address && <span>{shift.address}</span>}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${shift.has_shift_record
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                            }`}
                        >
                          {shift.has_shift_record ? "✅ 訪問記録 記載済み" : "⚠️ 訪問記録 未記載"}
                        </div>

                        <a
                          href="/portal/shift"
                          className="text-xs font-semibold text-blue-600 underline"
                        >
                          シフト・訪問記録を確認
                        </a>
                      </div>

                      <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-right">
                        <div className="text-xs text-blue-700">日払い対象額</div>
                        <div className="text-xl font-bold text-blue-800">
                          ¥{shift.amount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="text-2xl">✅</div>

              <div>
                <h2 className="text-lg font-bold text-orange-950">
                  申請前の確認事項
                </h2>
                <p className="mt-1 text-sm text-orange-900">
                  内容を確認し、すべての項目に同意した場合のみ申請できます。
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {confirmItems.map((item) => (
                <label
                  key={item.key}
                  className="
    flex
    cursor-pointer
    gap-3
    rounded-2xl
    border
    border-slate-200
    bg-white
    p-5
    shadow-sm
    hover:border-blue-300
    hover:shadow-md
    transition
  "
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-6 w-6 accent-blue-600"
                    checked={checks[item.key]}
                    onChange={(e) =>
                      setChecks((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                  />

                  <div>
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              {targetShifts.length === 0
                ? "申請可能な対象シフトがありません。"

                : !allChecked
                  ? "確認事項をすべてチェックしてください。"
                  : "申請できます。"}
            </div>

            <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-xl">
              <div className="space-y-4">

                <div className="flex items-center justify-between border-b border-blue-200 pb-3">
                  <span className="font-medium text-slate-600">1日合計金額</span>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    ¥{baseAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-red-600">
                  <span>対象外金額</span>
                  <span className="font-medium tabular-nums">
                    ▲¥{excludedAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-blue-100 pb-3 text-slate-700">
                  <span className="font-semibold">日払い計算対象額</span>
                  <span className="font-bold tabular-nums">
                    ¥{eligibleAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-red-600">
                  <span>
                    控除（{Math.round(calculation.deductionRate * 100)}%）
                  </span>
                  <span className="font-medium tabular-nums">
                    ▲¥{(eligibleAmount - calculation.availableAmount).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-red-600">
                  <span>手数料</span>
                  <span className="font-medium tabular-nums">
                    ▲¥200
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-blue-200 pt-4">
                  <span className="font-semibold text-slate-700">
                    振込予定額
                  </span>

                  <span className="text-4xl font-extrabold text-blue-700 tabular-nums">
                    ¥{Math.max(calculation.availableAmount - 200, 0).toLocaleString()}
                  </span>
                </div>

              </div>
            </div>
          </div>



          {!isSilverOrHigher && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div>日払い制度は、パフォーマンススコアがシルバー以上の職員のみ利用できます。

              </div>
              <a href="/portal/my-score-preview" className="mt-2 inline-block font-semibold text-red-800 underline">
                パフォーマンススコアを確認する
              </a>
            </div>
          )}


          {isAfterDeadline && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              本日の日払い申請受付は18:30で終了しました。
              対象シフトが表示されていても申請はできません。
            </div>
          )}
          {isManager && (
            <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">管理者・マネージャー向け表示</div>
              <div className="mt-1">
                マネージャー権限の方は、この画面を確認できますが、日払い申請はできません。
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4 mt-6">
            {rejectedApplication && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  })
                }
              >
                差し戻し理由を確認
              </Button>
            )}

            <div className="mt-6 flex flex-col items-center gap-3">
              <Button
                type="button"
                className="w-full rounded-2xl bg-blue-600 px-8 py-5 text-lg font-bold shadow-lg hover:bg-blue-700"
                disabled={!canSubmit}
                onClick={submitApplication}
              >
                {submitting ? "申請中..." : "日払い申請を送信"}
              </Button>

              {!canSubmit && !submitting && (
                <div className="text-sm text-slate-500">
                  申請条件を満たすと送信ボタンが有効になります。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
