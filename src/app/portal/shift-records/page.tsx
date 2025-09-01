// app/(standalone)/portal/shift-records/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ShiftRecord from "@/components/shift/ShiftRecord";

export default function ShiftRecordsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const shiftId = sp.get("shift_id") ?? "";

  // ESCで閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!shiftId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-4 shadow-xl w-[min(960px,96vw)]">
          shift_id が指定されていません
          <div className="mt-3 text-right">
            <button className="px-3 py-1 border rounded" onClick={() => router.back()}>閉じる</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // 背景=半透明。クリックで閉じる
    <div
      className="fixed inset-0 bg-black/50"
      onClick={() => router.back()}
    >
      {/* 中央のパネル（クリックバブリングを止める） */}
      <div
        className="absolute inset-0 flex items-start justify-center pt-6 sm:pt-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-2xl shadow-xl w-[min(1024px,96vw)] max-h-[90vh] overflow-auto p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base sm:text-lg font-semibold">訪問記録</h2>
            <button className="text-sm px-3 py-1 border rounded" onClick={() => router.back()}>× 閉じる</button>
          </div>
          <ShiftRecord shiftId={shiftId} />
        </div>
      </div>
    </div>
  );
}
