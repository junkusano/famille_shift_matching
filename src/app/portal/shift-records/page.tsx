//app/portal/shift-records/page.tsx
"use client";
import { useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ShiftRecord from "@/components/shift/ShiftRecord";

export default function ShiftRecordsPage() {
    const router = useRouter();
    const sp = useSearchParams();
    const shiftId = sp.get("shift_id") ?? "";
    const returnTo = sp.get("return_to") || null;

    // 共通の閉じる処理：return_to を最優先 → 戻れるなら back → 一覧にフォールバック
    const handleClose = useCallback(() => {
        if (returnTo) { router.push(returnTo); return; }
        if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
        router.push("/portal/shift-view");
    }, [returnTo, router]);

    // ESCで閉じる
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleClose]);

    if (!shiftId) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-2xl p-4 shadow-xl w-[min(960px,96vw)]">
                    shift_id が指定されていません
                    <div className="mt-3 text-right">
                        <button className="px-3 py-1 border rounded" onClick={handleClose}>閉じる</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        // 背景=半透明。クリックで閉じる
        <div className="fixed inset-0 bg-black/50" onClick={handleClose}>
            {/* 中央のパネル（クリックバブリングを止める） */}
            <div
                className="absolute inset-0 flex items-start justify-center pt-6 sm:pt-10 px-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-white rounded-2xl shadow-xl w-[min(960px,90vw)] max-h-[90vh] overflow-auto p-3 sm:p-4 ml-8 sm:ml-16">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-base sm:text-lg font-semibold">訪問記録</h2>
                        <button className="text-sm px-3 py-1 border rounded" onClick={handleClose}>× 閉じる</button>
                    </div>
                    <ShiftRecord shiftId={shiftId} />
                </div>
            </div>
        </div>
    );
}
