"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Plus, CheckCircle, XCircle, Clock } from "lucide-react";

const initialRows = [
  {
    id: "AP-2026-001",
    applicant: "山田 太郎",
    department: "営業部",
    amount: 50000,
    purpose: "出張費の先払い",
    paymentDueDate: "2026-05-31",
    status: "申請中",
    submittedAt: "2026-05-20",
  },
  {
    id: "AP-2026-002",
    applicant: "佐藤 花子",
    department: "制作部",
    amount: 30000,
    purpose: "備品購入費",
    paymentDueDate: "2026-06-05",
    status: "承認済み",
    submittedAt: "2026-05-19",
  },
];

const statusStyles = {
  申請中: "bg-yellow-100 text-yellow-800",
  承認済み: "bg-green-100 text-green-800",
  差戻し: "bg-red-100 text-red-800",
  支払済み: "bg-blue-100 text-blue-800",
};

export default function AdvancePaymentApplicationPage() {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    applicant: "",
    department: "",
    amount: "",
    purpose: "",
    paymentDueDate: "",
    remarks: "",
  });

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const text = `${row.id} ${row.applicant} ${row.department} ${row.purpose}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  const totalRequested = filteredRows.reduce((sum, row) => sum + row.amount, 0);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submitApplication(e) {
    e.preventDefault();
    const nextNumber = String(rows.length + 1).padStart(3, "0");
    const today = new Date().toISOString().slice(0, 10);
    const newRow = {
      id: `AP-2026-${nextNumber}`,
      applicant: form.applicant,
      department: form.department,
      amount: Number(form.amount || 0),
      purpose: form.purpose,
      paymentDueDate: form.paymentDueDate,
      status: "申請中",
      submittedAt: today,
    };
    setRows((prev) => [newRow, ...prev]);
    setForm({
      applicant: "",
      department: "",
      amount: "",
      purpose: "",
      paymentDueDate: "",
      remarks: "",
    });
  }

  function updateStatus(id, status) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
  }

  function exportCsv() {
    const header = ["申請ID", "申請者", "部署", "金額", "用途", "支払希望日", "ステータス", "申請日"];
    const body = rows.map((row) => [
      row.id,
      row.applicant,
      row.department,
      row.amount,
      row.purpose,
      row.paymentDueDate,
      row.status,
      row.submittedAt,
    ]);
    const csv = [header, ...body].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "advance_payment_applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="rounded-2xl border-blue-100 bg-blue-50 shadow-sm">
          <CardContent className="p-5 text-sm text-blue-900">
            <p className="font-semibold">データベース管理方針</p>
            <p className="mt-1">申請データは advance_payment_applications テーブルで管理し、振込先は employees または payroll_bank_accounts テーブルに登録済みの給与振込口座を参照します。</p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Advance Payment</p>
            <h1 className="text-3xl font-bold tracking-tight">先払い申請フォーム</h1>
            <p className="mt-2 text-slate-600">申請受付、承認状況、支払予定をデータベースで一元管理します。</p>
          </div>
          <Button onClick={exportCsv} className="gap-2 rounded-2xl">
            <Download size={18} /> CSV出力
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><p className="text-sm text-slate-500">対象件数</p><p className="mt-2 text-2xl font-bold">{filteredRows.length}件</p></CardContent></Card>
          <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><p className="text-sm text-slate-500">合計申請額</p><p className="mt-2 text-2xl font-bold">¥{totalRequested.toLocaleString()}</p></CardContent></Card>
          <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><p className="text-sm text-slate-500">申請中</p><p className="mt-2 text-2xl font-bold">{rows.filter((r) => r.status === "申請中").length}件</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-2">
                <Plus size={20} />
                <h2 className="text-xl font-semibold">新規申請</h2>
              </div>
              <form onSubmit={submitApplication} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder="申請者名" value={form.applicant} onChange={(e) => handleChange("applicant", e.target.value)} required />
                  <Input placeholder="部署" value={form.department} onChange={(e) => handleChange("department", e.target.value)} required />
                </div>
                <Input type="number" placeholder="申請金額" value={form.amount} onChange={(e) => handleChange("amount", e.target.value)} required />
                <Textarea placeholder="先払いの目的・理由" value={form.purpose} onChange={(e) => handleChange("purpose", e.target.value)} required />
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">支払希望日</label>
                  <Input type="date" value={form.paymentDueDate} onChange={(e) => handleChange("paymentDueDate", e.target.value)} required />
                </div>
                <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
                  振込先は、登録済みの給与振込口座を使用します。申請者による口座情報の入力は不要です。
                </div>
                <Textarea placeholder="備考" value={form.remarks} onChange={(e) => handleChange("remarks", e.target.value)} />
                <Button type="submit" className="w-full rounded-2xl">申請を登録</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-semibold">申請管理テーブル</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
                    <Input className="pl-9" placeholder="検索" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="ステータス" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全て</SelectItem>
                      <SelectItem value="申請中">申請中</SelectItem>
                      <SelectItem value="承認済み">承認済み</SelectItem>
                      <SelectItem value="差戻し">差戻し</SelectItem>
                      <SelectItem value="支払済み">支払済み</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left text-slate-600">
                    <tr>
                      <th className="p-3">申請ID</th>
                      <th className="p-3">申請者</th>
                      <th className="p-3">金額</th>
                      <th className="p-3">用途</th>
                      <th className="p-3">支払希望日</th>
                      <th className="p-3">状態</th>
                      <th className="p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3 font-medium">{row.id}</td>
                        <td className="p-3"><div>{row.applicant}</div><div className="text-xs text-slate-500">{row.department}</div></td>
                        <td className="p-3">¥{row.amount.toLocaleString()}</td>
                        <td className="max-w-[220px] truncate p-3">{row.purpose}</td>
                        <td className="p-3">{row.paymentDueDate}</td>
                        <td className="p-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusStyles[row.status]}`}>{row.status}</span></td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, "承認済み")}><CheckCircle size={15} /></Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, "差戻し")}><XCircle size={15} /></Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, "支払済み")}><Clock size={15} /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
