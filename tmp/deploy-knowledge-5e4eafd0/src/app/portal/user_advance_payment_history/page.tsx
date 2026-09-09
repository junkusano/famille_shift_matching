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


type HistoryRow = {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  client_name: string;
  staff_user_ids: string[];
  staff_names: string[];
  application_no: string | null;
  application_status: string;
  application_status_label: string;
  applicant_name: string | null;
  base_amount: number | null;
  available_amount: number | null;
  amount: number | null;
  total_deduction_amount: number | null;
  transfer_amount: number | null;
  applied_at: string | null;
  rejected_reason: string | null;
  deduction_reasons: string[];
  deduction_rate: number | null;
};


const statusClass: Record<string, string> = {
  unsubmitted: "bg-slate-100 text-slate-700",
  submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  paid: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-600",
};

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
  const [toDate, setToDate] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [rejectingApplicationNo, setRejectingApplicationNo] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const normalizedRole = me?.role?.trim().toUpperCase() ?? "";

  const canViewAll =
   normalizedRole === "MANAGER" ||
     normalizedRole === "ADMIN";

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        const token = session?.access_token;
        if (!token) {
          setErrorMessage("ログイン情報を取得できませんでした。");
          return;
        }

        const res = await fetch("/api/advance-payment/history", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json();

        console.log("history api status:", res.status);
        console.log("history api json:", json);

        console.log("history api ok:", json.ok);
        console.log("history api role:", json.role);
        console.log("history api canViewAll:", json.canViewAll);
        console.log("history api count:", json.count);
        console.log("history api rows:", json.rows);

        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "履歴データの取得に失敗しました");
        }

        setMe({
          user_id: json.user_id,
          role: json.role,
        });

        setRows(json.rows ?? []);
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



async function updateStatus(
  applicationNo: string | null,
  status: string
) {
  if (!applicationNo) return;

  setErrorMessage("");

  const { error } = await supabase
    .from("user_advance_payment_applications")
    .update({
      status,
      paid_at:
        status === "paid"
          ? new Date().toISOString()
          : null,
    })
    .eq("application_no", applicationNo);

  if (error) {
    setErrorMessage("ステータス更新に失敗しました。");
    return;
  }


  const notifyRes = await fetch(
    "/api/lineworks/advance-payment-status-notify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        applicationNo,
        status,
      }),
    }
  );

  if (!notifyRes.ok) {
    setErrorMessage(
      "ステータスは更新されましたが、LINE WORKS通知に失敗しました。"
    );
    return;
  }

  window.location.reload();
}
async function rejectApplication() {
  if (!rejectingApplicationNo) return;

  const reason = rejectReason.trim();

  if (!reason) {
    setErrorMessage("却下理由を入力してください。");
    return;
  }

  const { error } = await supabase
    .from("user_advance_payment_applications")
    .update({
      status: "rejected",
      rejected_reason: reason,
      paid_at: null,
    })
    .eq("application_no", rejectingApplicationNo);

  if (error) {
    setErrorMessage("却下処理に失敗しました。");
    return;
  }

  await fetch(
    "/api/lineworks/advance-payment-status-notify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        applicationNo: rejectingApplicationNo,
        status: "rejected",
        rejectedReason: reason,
      }),
    }
  );

  window.location.reload();
}

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Advance Payment History</p>
            <h1 className="text-2xl font-bold">日払い申請履歴</h1>
            <p className="mt-1 text-sm text-slate-600">
              申請済み・未申請・承認状況をシフト単位で確認できます。
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
        {rejectingApplicationNo && (
  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
    <div className="font-semibold mb-2">
      却下理由を入力してください
    </div>

    <textarea
      className="w-full rounded border p-2"
      rows={4}
      value={rejectReason}
      onChange={(e) => setRejectReason(e.target.value)}
    />

    <div className="mt-3 flex gap-2">
      <Button
        variant="destructive"
        onClick={rejectApplication}
      >
        却下確定
      </Button>

      <Button
        variant="outline"
        onClick={() => {
          setRejectingApplicationNo(null);
          setRejectReason("");
        }}
      >
        キャンセル
      </Button>
    </div>
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
                    <th className="p-3">申請者</th>
                    <th className="p-3">ステータス</th>
                    <th className="p-3">差し戻し理由</th>
                    <th className="p-3">操作</th>
                    <th className="p-3">日払い対象額</th>
                    <th className="p-3">控除額</th>
                    <th className="p-3">振込予定額</th>
                    <th className="p-3">控除内訳</th>
                    </tr>
                  </thead>
                  <tbody>
                   {filteredRows.map((row) => (
  <tr key={row.application_no ?? row.shift_id} className="border-t">
    <td className="p-3">
      {row.shift_start_date}
    </td>
    <td className="p-3">{row.applicant_name ?? "-"}</td>
    <td className="p-3">
  <span
    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
      statusClass[row.application_status] ?? "bg-slate-100 text-slate-700"
    }`}
  >
    {row.application_status_label}
  </span>
</td>

<td className="p-3 text-sm text-red-700">
  {row.application_status === "rejected"
    ? row.rejected_reason || "理由未入力"
    : "-"}
</td>

<td className="p-3">
  {canViewAll ? (
    
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={row.application_status === "paid"}
        onClick={() => updateStatus(row.application_no, "paid")}
      >
        振込済みにする
      </Button>

      <Button
        size="sm"
        variant="destructive"
        disabled={
          row.application_status === "paid" ||
          row.application_status === "rejected"
        }
        onClick={() => {
          setRejectingApplicationNo(row.application_no);
          setRejectReason("");
        }}
      >
        却下
      </Button>
    </div>
  ) : (
    "-"
  )}
</td>
    <td className="p-3">{yen(row.base_amount)}</td>

<td className="p-3 text-red-600">
  ▲{yen(row.total_deduction_amount)}
</td>

<td className="p-3 font-bold text-blue-700">
  {yen(row.transfer_amount)}
</td>

<td className="p-3 text-xs text-slate-500">
      {row.deduction_reasons.length > 0
        ? row.deduction_reasons.join(" / ")
        : "-"}
      {row.deduction_rate !== null && (
        <span className="ml-2">
          控除率：{Math.round(row.deduction_rate * 100)}%
        </span>
      )}
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
