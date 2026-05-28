"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserRole = "admin" | "manager" | "user" | string;

type LoginUser = {
  user_id: string;
  role: UserRole | null;
};

type ShiftRow = {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  kaipoke_cs_id: string | null;
  name: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

type ApplicationRow = {
  id: number;
  application_no: string;
  user_id: string | null;
  employee_name: string | null;
  department: string | null;
  amount: number | string;
  reason: string;
  desired_payment_date: string;
  status: string;
  shift_ids: string[] | null;
  approved_at: string | null;
  paid_at: string | null;
  rejected_reason: string | null;
  created_at: string;
};

type HistoryRow = {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  client_name: string;
  staff_user_ids: string[];
  application_no: string | null;
  application_status: string;
  application_status_label: string;
  applicant_name: string | null;
  amount: number | null;
  desired_payment_date: string | null;
  applied_at: string | null;
  rejected_reason: string | null;
};

const statusLabel: Record<string, string> = {
  unsubmitted: "未申請",
  submitted: "申請中",
  approved: "承認済み",
  rejected: "差戻し",
  paid: "支払済み",
  cancelled: "取消",
};

const statusClass: Record<string, string> = {
  unsubmitted: "bg-slate-100 text-slate-700",
  submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  paid: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function toJstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function getAvailableApplicationDate(shiftDate: string, shiftEndTime: string) {
  const endTime = (shiftEndTime || "").slice(0, 5);

  if (endTime <= "18:00") {
    return shiftDate;
  }

  const date = new Date(`${shiftDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isShiftApplicationTarget(shiftDate: string, shiftEndTime: string) {
  const todayJst = toJstDateString();
  return todayJst >= getAvailableApplicationDate(shiftDate, shiftEndTime);
}

function yen(value: number | null) {
  if (value === null) return "-";
  return `¥${value.toLocaleString()}`;
}

export default function UserAdvancePaymentHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<LoginUser | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(toJstDateString());
  const [errorMessage, setErrorMessage] = useState("");

  const isManager = me?.role === "manager" || me?.role === "admin";

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          setErrorMessage("ログイン情報を取得できませんでした。");
          return;
        }

        const { data: loginUser, error: userError } = await supabase
          .from("users")
          .select("user_id, role")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (userError) throw userError;
        if (!loginUser?.user_id) {
          setErrorMessage("users テーブルでログインユーザーの user_id を取得できませんでした。");
          return;
        }

        const currentUser = loginUser as LoginUser;
        setMe(currentUser);

        const manager = currentUser.role === "manager" || currentUser.role === "admin";
        const todayJst = toJstDateString();

        let shiftQuery = supabase
          .from("shift_csinfo_postalname_view")
          .select(`
            shift_id,
            shift_start_date,
            shift_start_time,
            shift_end_time,
            kaipoke_cs_id,
            name,
            staff_01_user_id,
            staff_02_user_id,
            staff_03_user_id
          `)
          .lte("shift_start_date", todayJst)
          .order("shift_start_date", { ascending: false })
          .order("shift_start_time", { ascending: false });

        if (!manager) {
          shiftQuery = shiftQuery.or(
            `staff_01_user_id.eq.${currentUser.user_id},staff_02_user_id.eq.${currentUser.user_id},staff_03_user_id.eq.${currentUser.user_id}`
          );
        }

        const { data: shiftsData, error: shiftsError } = await shiftQuery;
        if (shiftsError) throw shiftsError;

        let appQuery = supabase
          .from("user_advance_payment_applications")
          .select(`
            id,
            application_no,
            user_id,
            employee_name,
            department,
            amount,
            reason,
            desired_payment_date,
            status,
            shift_ids,
            approved_at,
            paid_at,
            rejected_reason,
            created_at
          `)
          .order("created_at", { ascending: false });

        if (!manager) {
          appQuery = appQuery.eq("user_id", currentUser.user_id);
        }

        const { data: appsData, error: appsError } = await appQuery;
        if (appsError) throw appsError;

        const applications = (appsData ?? []) as ApplicationRow[];
        const appByShiftId = new Map<string, ApplicationRow>();

        applications.forEach((app) => {
          (app.shift_ids ?? []).forEach((shiftId) => {
            if (!appByShiftId.has(shiftId)) {
              appByShiftId.set(shiftId, app);
            }
          });
        });

        const historyRows: HistoryRow[] = ((shiftsData ?? []) as ShiftRow[])
          .filter((shift) => isShiftApplicationTarget(shift.shift_start_date, shift.shift_end_time))
          .map((shift) => {
            const app = appByShiftId.get(shift.shift_id);
            const rawStatus = app?.status ?? "unsubmitted";

            return {
              shift_id: shift.shift_id,
              shift_start_date: shift.shift_start_date,
              shift_start_time: shift.shift_start_time,
              shift_end_time: shift.shift_end_time,
              client_name: shift.name ?? shift.kaipoke_cs_id ?? "-",
              staff_user_ids: [
                shift.staff_01_user_id,
                shift.staff_02_user_id,
                shift.staff_03_user_id,
              ].filter((v): v is string => Boolean(v)),
              application_no: app?.application_no ?? null,
              application_status: rawStatus,
              application_status_label: statusLabel[rawStatus] ?? rawStatus,
              applicant_name: app?.employee_name ?? null,
              amount: app ? Number(app.amount) : null,
              desired_payment_date: app?.desired_payment_date ?? null,
              applied_at: app?.created_at ?? null,
              rejected_reason: app?.rejected_reason ?? null,
            };
          });

        setRows(historyRows);
      } catch (error) {
        console.error(error);
        setErrorMessage("履歴データの取得中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const text = [
        row.shift_id,
        row.client_name,
        row.application_no ?? "",
        row.applicant_name ?? "",
        row.staff_user_ids.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = text.includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.application_status === statusFilter;
      const matchesFrom = !fromDate || row.shift_start_date >= fromDate;
      const matchesTo = !toDate || row.shift_start_date <= toDate;

      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [rows, query, statusFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    return {
      total: filteredRows.length,
      unsubmitted: filteredRows.filter((r) => r.application_status === "unsubmitted").length,
      submitted: filteredRows.filter((r) => r.application_status === "submitted").length,
      approved: filteredRows.filter((r) => r.application_status === "approved").length,
      paid: filteredRows.filter((r) => r.application_status === "paid").length,
    };
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Advance Payment History</p>
            <h1 className="text-2xl font-bold">先払い申請履歴</h1>
            <p className="mt-1 text-sm text-slate-600">
              申請済み・未申請・承認状況をシフト単位で確認できます。
              {isManager ? " マネージャー権限のため全職員分を表示しています。" : " 自分のシフトのみ表示しています。"}
            </p>
          </div>

          <Button asChild variant="outline">
            <Link href="/portal/user_advance_payment_applications">申請フォームへ</Link>
          </Button>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-5">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">対象シフト</p>
              <p className="mt-1 text-2xl font-bold">{summary.total}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">未申請</p>
              <p className="mt-1 text-2xl font-bold">{summary.unsubmitted}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">申請中</p>
              <p className="mt-1 text-2xl font-bold">{summary.submitted}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">承認済み</p>
              <p className="mt-1 text-2xl font-bold">{summary.approved}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">支払済み</p>
              <p className="mt-1 text-2xl font-bold">{summary.paid}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">検索</label>
                <Input
                  placeholder="利用者名・申請番号・職員ID"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">ステータス</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="ステータス" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="unsubmitted">未申請</SelectItem>
                    <SelectItem value="submitted">申請中</SelectItem>
                    <SelectItem value="approved">承認済み</SelectItem>
                    <SelectItem value="rejected">差戻し</SelectItem>
                    <SelectItem value="paid">支払済み</SelectItem>
                    <SelectItem value="cancelled">取消</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">シフト日 From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">シフト日 To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-white p-6 text-sm text-slate-500">読み込み中...</div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-sm text-slate-500">該当する履歴がありません。</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-100 text-left text-slate-600">
                    <tr>
                      <th className="p-3">シフト日</th>
                      <th className="p-3">時間</th>
                      <th className="p-3">利用者</th>
                      <th className="p-3">職員ID</th>
                      <th className="p-3">申請状況</th>
                      <th className="p-3">申請番号</th>
                      <th className="p-3">申請者</th>
                      <th className="p-3">申請額</th>
                      <th className="p-3">支払希望日</th>
                      <th className="p-3">申請日</th>
                      <th className="p-3">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.shift_id} className="border-t">
                        <td className="p-3 font-medium">{row.shift_start_date}</td>
                        <td className="p-3">
                          {row.shift_start_time?.slice(0, 5)} - {row.shift_end_time?.slice(0, 5)}
                        </td>
                        <td className="p-3">{row.client_name}</td>
                        <td className="p-3 text-xs text-slate-500">{row.staff_user_ids.join(" / ")}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              statusClass[row.application_status] ?? "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.application_status_label}
                          </span>
                        </td>
                        <td className="p-3">{row.application_no ?? "-"}</td>
                        <td className="p-3">{row.applicant_name ?? "-"}</td>
                        <td className="p-3">{yen(row.amount)}</td>
                        <td className="p-3">{row.desired_payment_date ?? "-"}</td>
                        <td className="p-3">{row.applied_at ? row.applied_at.slice(0, 10) : "-"}</td>
                        <td className="p-3 text-xs text-slate-500">
                          {row.rejected_reason ? `差戻し理由：${row.rejected_reason}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
