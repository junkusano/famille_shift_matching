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
  has_social_insurance?: boolean;
  has_employment_insurance?: boolean;
  has_employee_loan?: boolean;
};

type ShiftRow = {
  id: string | number | null;
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
};

type ConfirmKey =
  | "shiftConfirmed"
  | "recordRequired"
  | "feeAccepted"
  | "insuranceAccepted";

const confirmItems: Array<{ key: ConfirmKey; label: string; description: string }> = [
  {
    key: "shiftConfirmed",
    label: "表示されているシフト内容に相違がないことを確認しました。",
    description: "対象シフトの日付・時間・利用者情報を確認したうえで申請します。",
  },
  {
    key: "recordRequired",
    label: "訪問記録が未提出の場合、振込処理が完了しないことを了承しました。",
    description: "先払い申請後でも、必要な訪問記録の提出が確認できない場合は振込対象外となることがあります。",
  },
  {
    key: "feeAccepted",
    label: "振込にかかる手数料として200円が差し引かれることを了承しました。",
    description: "振込額から事務・振込手数料相当額として200円を差し引きます。",
  },
  {
    key: "insuranceAccepted",
    label: "加入保険の状況により、振込可能額が変動する場合があることを了承しました。",
    description: "申請可能額は、社会保険・雇用保険等の加入状況、社員貸付の有無により減額される場合があります。複数条件に該当する場合は、それぞれ10%ずつ控除され、最大30%控除後の金額が申請上限額となります。",
  },
];

function toJstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getTargetWindowJst() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();

  const end = new Date(Date.UTC(y, m, d, 18, 0, 0));
  const start = new Date(Date.UTC(y, m, d - 1, 18, 30, 0));

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
  let deductionRate = 0;
  const reasons: string[] = [];

  if (params.hasSocialInsurance) {
    deductionRate += 0.1;
    reasons.push("社会保険加入");
  }

  if (params.hasEmploymentAndWorkersInsurance) {
    deductionRate += 0.1;
    reasons.push("雇用保険・労災保険加入");
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
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<ConfirmKey, boolean>>({
    shiftConfirmed: false,
    recordRequired: false,
    feeAccepted: false,
    insuranceAccepted: false,
  });

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { start, end } = useMemo(() => getTargetWindowJst(), []);

  const allChecked = confirmItems.every((item) => checks[item.key]);
  const hasSelectedShift = selectedShiftIds.length > 0;
  const canSubmit = hasSelectedShift && allChecked && !submitting;

  const selectedShifts = useMemo(
    () => targetShifts.filter((shift) => selectedShiftIds.includes(shift.shift_id)),
    [targetShifts, selectedShiftIds]
  );
  const baseAmount = selectedShifts.length * 10000;

  const calculation = calculateAvailableAmount({
    baseAmount,
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
          .select("user_id, last_name_kanji, first_name_kanji, department, has_social_insurance,has_employment_insurance,has_employee_loan")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (userError) throw userError;
        if (!loginUser?.user_id) {
          setErrorMessage("ログインユーザーの user_id を取得できませんでした。");
          return;
        }

        const currentUser = loginUser as LoginUser;
        setMe(currentUser);

        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);

        const { data, error } = await supabase
          .from("shift_csinfo_postalname_view")
          .select(`
            id,
            shift_id,
            shift_start_date,
            shift_start_time,
            shift_end_time,
            service_code,
            kaipoke_cs_id,
            name,
            district,
            staff_01_user_id,
            staff_02_user_id,
            staff_03_user_id
          `)
          .gte("shift_start_date", startDate)
          .lte("shift_start_date", endDate)
          .or(
            `staff_01_user_id.eq.${currentUser.user_id},staff_02_user_id.eq.${currentUser.user_id},staff_03_user_id.eq.${currentUser.user_id}`
          )
          .order("shift_start_date", { ascending: true })
          .order("shift_start_time", { ascending: true });

        if (error) throw error;

        const rows = (data ?? []) as ShiftRow[];
        const filtered = rows
          .filter((shift) => {
            const shiftEnd = makeJstDateTime(shift.shift_start_date, shift.shift_end_time);
            return shiftEnd >= start && shiftEnd <= end;
          })
          .map((shift) => ({
            id: String(shift.id ?? shift.shift_id),
            shift_id: shift.shift_id,
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            shift_end_time: shift.shift_end_time,
            client_name: shift.name ?? shift.kaipoke_cs_id ?? "利用者名未設定",
            address: shift.district ?? "",
            service_code: shift.service_code ?? "",
          }));

        setTargetShifts(filtered);
        setSelectedShiftIds(filtered.map((shift) => shift.shift_id));
      } catch (error) {
        console.error(error);
        setErrorMessage("対象シフトの取得中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchTargetShifts();
  }, [start, end]);

  function toggleShift(shiftId: string) {
    setSelectedShiftIds((prev) =>
      prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId]
    );
  }

  function toggleCheck(key: ConfirmKey) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submitApplication() {
    try {
      if (!me) {
        setErrorMessage("ログインユーザー情報を取得できていません。");
        return;
      }
      if (!canSubmit) return;

      setSubmitting(true);
      setErrorMessage("");
      setMessage("");

      const baseAmount = selectedShifts.length * 10000;

      const calculation = calculateAvailableAmount({
        baseAmount,
        hasSocialInsurance: Boolean(me.has_social_insurance),
        hasEmploymentAndWorkersInsurance: Boolean(
          me.has_employment_insurance
        ),
        hasEmployeeLoan: Boolean(me.has_employee_loan),
      });


      const employeeName = `${me.last_name_kanji ?? ""} ${me.first_name_kanji ?? ""}`.trim();
      const applicationNo = makeApplicationNo();

      const { error } = await supabase.from("user_advance_payment_applications").insert({
        application_no: applicationNo,
        user_id: me.user_id,
        employee_name: employeeName || me.user_id,
        department: me.department ?? null,
        base_amount: baseAmount,
        deduction_rate: calculation.deductionRate,
        available_amount: calculation.availableAmount,
        deduction_reasons: calculation.reasons,
        amount: calculation.availableAmount,
        reason: "対象シフトに基づく先払い申請",
        desired_payment_date: toJstDateString(),
        status: "submitted",
        shift_ids: selectedShiftIds,
        remarks: JSON.stringify({
          confirmation: checks,
          target_window: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
          selected_shifts: selectedShifts.map((shift) => ({
            shift_id: shift.shift_id,
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            shift_end_time: shift.shift_end_time,
            client_name: shift.client_name,
          })),
        }),
      });

      if (error) throw error;

      setMessage(`先払い申請を受け付けました。申請番号：${applicationNo}`);
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
          <h1 className="text-2xl font-bold">先払い申請</h1>
          <p className="mt-2 text-sm text-slate-600">
            前日18:30から当日18:00までに終了した、ご自身の対象シフトを確認して申請してください。
          </p>
        </div>

        <Card className="rounded-2xl border-blue-100 bg-blue-50 shadow-sm">
          <CardContent className="p-4 text-sm text-blue-900">
            <div className="font-semibold">対象期間</div>
            <div className="mt-1">
              前日18:30 ～ 当日18:00終了分
            </div>
            <div className="mt-1 text-xs text-blue-700">
              対象シフトはログイン中の職員IDに紐づくシフトのみ表示されます。
            </div>
          </CardContent>
        </Card>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">対象シフト</h2>
                <p className="text-sm text-slate-500">
                  申請するシフトにチェックを入れてください。初期状態では対象シフトをすべて選択しています。
                </p>
              </div>
              <div className="text-sm text-slate-500">
                選択中 {selectedShiftIds.length}件 / {targetShifts.length}件
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">読み込み中...</div>
            ) : targetShifts.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                現在、先払い申請の対象となるシフトはありません。
              </div>
            ) : (
              <div className="space-y-3">
                {targetShifts.map((shift) => (
                  <label
                    key={shift.shift_id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                      selectedShiftIds.includes(shift.shift_id)
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={selectedShiftIds.includes(shift.shift_id)}
                      onChange={() => toggleShift(shift.shift_id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">
                        {shift.shift_start_date} {formatTime(shift.shift_start_time)} - {formatTime(shift.shift_end_time)}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{shift.client_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {shift.service_code && <span>サービスコード：{shift.service_code}</span>}
                        {shift.service_code && shift.address && <span> ／ </span>}
                        {shift.address && <span>{shift.address}</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-orange-200 bg-orange-50 shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold text-orange-950">申請前の確認事項</h2>
            <p className="mt-1 text-sm text-orange-900">
              内容を確認し、すべての項目に同意した場合のみ申請できます。
            </p>

            <div className="mt-4 space-y-3">
              {confirmItems.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer gap-3 rounded-2xl bg-white p-4 shadow-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={checks[item.key]}
                    onChange={() => toggleCheck(item.key)}
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

        <div className="sticky bottom-0 rounded-2xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              {targetShifts.length === 0
                ? "申請可能な対象シフトがありません。"
                : !hasSelectedShift
                  ? "申請するシフトを1件以上選択してください。"
                  : !allChecked
                    ? "確認事項をすべてチェックしてください。"
                    : "申請できます。"}
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">
                申請可能額
              </div>
              <div className="mt-1 text-2xl font-bold">
                ¥{calculation.availableAmount.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                控除率： {Math.round(calculation.deductionRate * 100)}%
              </div>
              <div className="mt-1 text-xs text-slate-500">
                 {calculation.reasons.join(" / ")}
              </div>
            </div>

            <Button
              type="button"
              className="rounded-2xl px-6"
              disabled={!canSubmit}
              onClick={submitApplication}
            >
              {submitting ? "申請中..." : "先払い申請を送信"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
