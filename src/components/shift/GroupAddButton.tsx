// components/shift/GroupAddButton.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftData } from "@/types/shift";

export default function GroupAddButton({ shift }: { shift: ShiftData }) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data?.session?.user?.id;
      if (!userId) throw new Error("ユーザー情報取得失敗");

      const { data: chanData } = await supabase
        .from("group_lw_channel_view")
        .select("group_id")
        .eq("group_account", shift.kaipoke_cs_id)
        .maybeSingle();

      const { data: userData } = await supabase
        .from("user_entry_united_view")
        .select("lw_userid")
        .eq("auth_user_id", userId)
        .eq("group_type", "人事労務サポートルーム")
        .limit(1)
        .single();

      const senderId = userData?.lw_userid;
      if (!chanData?.group_id || !senderId) throw new Error("groupId または userId が不明です");

      const res = await fetch("/api/lw-group-user-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: chanData.group_id, userId: senderId }),
      });

      const text = await res.text();
      if (!res.ok) {
        if (text.includes("Group member already exist")) {
          alert("✅ すでにグループメンバーに追加されています。");
        } else {
          alert(`❌ グループ追加失敗: ${text}`);
        }
      } else {
        alert("✅ グループに追加されました");
      }
    } catch (e) {
      alert("エラー: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setProcessing(false);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="mt-2 text-xs flex items-center gap-1 px-2 py-1 border border-gray-400 rounded hover:bg-gray-100">
          <Image src="/8aeeac38-ce77-4c97-b2e9-2fcd97c5ed4a.jpg" alt="LW" width={16} height={16} />
          <span>グループ追加</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>メンバー追加確認</DialogTitle>
        <DialogDescription>{shift.client_name} 様の情報連携グループにメンバー追加しますか？</DialogDescription>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setOpen(false)} className="border rounded px-3 py-1 text-sm">
            キャンセル
          </button>
          <button onClick={handleConfirm} disabled={processing} className="bg-blue-600 text-white rounded px-4 py-1 text-sm">
            {processing ? "追加中..." : "OK"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
