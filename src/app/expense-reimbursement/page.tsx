"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ExpenseReimbursementPage() {
  const MAX_FILE_MB = 4;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formEl = e.currentTarget;
    const form = new FormData(formEl);

    const staffName = String(form.get("staffName") || "").trim();
    const serviceDate = String(form.get("serviceDate") || "");
    const serviceStartTime = String(form.get("serviceStartTime") || "");
    const serviceEndTime = String(form.get("serviceEndTime") || "");
    const expenseAmount = Number(form.get("expenseAmount") || 0);
    const receiptFile = form.get("receiptPhoto") as File | null;

    if (!staffName) return alert("名前を入力してください。");
    if (!serviceDate) return alert("サービスに入った日付を入力してください。");
    if (!serviceStartTime) return alert("サービス開始時間を入力してください。");
    if (!expenseAmount || expenseAmount <= 0) return alert("経費金額を入力してください。");
    if (!receiptFile || receiptFile.size === 0) return alert("領収書の写真を添付してください。");

    if (receiptFile.size > MAX_FILE_MB * 1024 * 1024) {
      return alert(`領収書の写真は${MAX_FILE_MB}MB以内にしてください。`);
    }

    setIsSubmitting(true);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const fd = new FormData();
      fd.append("file", receiptFile);
      fd.append("filename", `expense_receipt_${staffName}_${timestamp}_${receiptFile.name}`);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      if (!uploadRes.ok) {
        throw new Error("領収書写真のアップロードに失敗しました。");
      }

      const uploadJson = await uploadRes.json();
      const receiptPhotoUrl = uploadJson.url ?? null;

      const payload = {
          staff_name: staffName,
          service_date: serviceDate,
          service_start_time: serviceStartTime,
          service_end_time: serviceEndTime || null,

          expense_amount: expenseAmount,
          expense_detail: String(form.get("expenseDetail") || ""),

          bank_name: String(form.get("bankName") || ""),
          branch_name: String(form.get("branchName") || ""),
          branch_number: String(form.get("branchNumber") || ""),
          bank_symbol: String(form.get("bankSymbol") || ""),
          account_number: String(form.get("accountNumber") || ""),

          receipt_photo_url: receiptPhotoUrl,
        };

      const { error } = await supabase
        .from("expense_reimbursements")
        .insert([payload]);

      if (error) throw error;

      // 通知は失敗しても申請自体は成立
      try {
        await fetch("/api/expense-reimbursement/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
      });
      } catch (notifyError) {
        console.warn("経費精算通知に失敗しました", notifyError);
      }

      formEl.reset();
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "送信に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-4">経費精算フォーム</h1>
        <p>送信が完了しました。</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-6">経費精算フォーム</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium">名前<span className="text-red-500">*</span></label>
          <input name="staffName" className="w-full border rounded p-2" required />
        </div>

        <div>
          <label className="block text-sm font-medium">サービスに入った日付<span className="text-red-500">*</span></label>
          <input type="date" name="serviceDate" className="w-full border rounded p-2" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">開始時間<span className="text-red-500">*</span></label>
            <input type="time" name="serviceStartTime" className="w-full border rounded p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium">終了時間</label>
            <input type="time" name="serviceEndTime" className="w-full border rounded p-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">サービス中に使用した経費（金額）<span className="text-red-500">*</span></label>
          <input type="number" name="expenseAmount" className="w-full border rounded p-2" required />
        </div>

        <div>
          <label className="block text-sm font-medium">経費の内容</label>
          <textarea name="expenseDetail" rows={3} className="w-full border rounded p-2" placeholder="例：駐車場代、電車代など" />
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">口座情報</h2>

          <input name="bankName" className="w-full border rounded p-2" placeholder="銀行名" />
          <input name="branchName" className="w-full border rounded p-2" placeholder="支店名" />
          <input name="branchNumber" className="w-full border rounded p-2" placeholder="支店番号" />
          <input name="bankSymbol" className="w-full border rounded p-2" placeholder="記号" />
          <input name="accountNumber" className="w-full border rounded p-2" placeholder="番号" />
        </div>

        <div>
          <label className="block text-sm font-medium">
            領収書の写真<span className="text-red-500">*</span>
            <span className="ml-2 text-xs text-gray-500">上限 {MAX_FILE_MB}MB</span>
          </label>
          <input type="file" name="receiptPhoto" accept="image/*,.pdf" className="w-full border rounded p-2" required />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white rounded p-3 disabled:opacity-50"
        >
          {isSubmitting ? "送信中..." : "送信する"}
        </button>
      </form>
    </main>
  );
}