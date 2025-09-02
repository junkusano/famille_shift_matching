// components/shift/ShiftRecordLinkButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ShiftRecordLinkButton({
  shiftId,
  clientName,                          // ← 追加
  label = "訪問記録（工事中）",
  hrefBase = "/portal/shift-records",
}: {
  shiftId: string;
  clientName?: string;                  // ← 追加
  label?: string;
  hrefBase?: string;
}) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        const q =
          `?shift_id=${encodeURIComponent(shiftId)}`
          + (clientName ? `&client_name=${encodeURIComponent(clientName)}` : ""); // ← 追加
        router.push(`${hrefBase}${q}`);
      }}
    >
      {label}
    </Button>
  );
}
