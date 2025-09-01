// components/shift/ShiftRecordLinkButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ShiftRecordLinkButton({
  shiftId, label = "訪問記録（工事中）", hrefBase = "/portal/shift-records",
}: { shiftId: string; label?: string; hrefBase?: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => {
      const q = `?shift_id=${encodeURIComponent(shiftId)}`;
      router.push(`${hrefBase}${q}`);
    }}>
      {label}
    </Button>
  );
}
