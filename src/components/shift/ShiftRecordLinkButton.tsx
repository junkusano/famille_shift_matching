// components/shift/ShiftRecordLinkButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Propsの型定義
interface ShiftRecordLinkButtonProps {
  shiftId: string;
  clientName?: string;
  // --- Propsの型定義に3項目を追加 ---
  standardRoute?: string | null;
  standardTransWays?: string | null;
  standardPurpose?: string | null;
  // -----------------------------------
  label?: string;
  hrefBase?: string;
}

export default function ShiftRecordLinkButton({
  shiftId,
  clientName,
  // --- ここに3項目を追加し、Propsから値を取り出します ---
  standardRoute,
  standardTransWays,
  standardPurpose,
  // ----------------------------------------------------
  label = "訪問記録（工事中）",
  hrefBase = "/portal/shift-records",
}: ShiftRecordLinkButtonProps) { // 型はここで指定
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        let q =
          `?shift_id=${encodeURIComponent(shiftId)}`
        if (clientName) {
          q += `&client_name=${encodeURIComponent(clientName)}`;
        }
        if (standardRoute) {
          q += `&standard_route=${encodeURIComponent(standardRoute)}`;
        }
        if (standardTransWays) {
          q += `&standard_trans_ways=${encodeURIComponent(standardTransWays)}`;
        }
        if (standardPurpose) {
          q += `&standard_purpose=${encodeURIComponent(standardPurpose)}`;
        }
        router.push(`${hrefBase}${q}`);
      }}
    >
      {label}
    </Button>
  );
}
