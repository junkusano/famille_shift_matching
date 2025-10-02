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

  staff01UserId?: string | null;
  staff02UserId?: string | null;
  staff03UserId?: string | null;
  staff02AttendFlg?: string | number | boolean | null;
  staff03AttendFlg?: string | number | boolean | null;
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

  staff01UserId, staff02UserId, staff03UserId,
    staff02AttendFlg, staff03AttendFlg,
  // ----------------------------------------------------
  label = "訪問記録",
  hrefBase = "/portal/shift-records",
}: ShiftRecordLinkButtonProps) { // 型はここで指定
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={() => {

        // ① 受け取れてるか props を先に表示
        /*
        alert(
          [
            "[SRLB] props",
            `shiftId=${JSON.stringify(shiftId)}`,
            `clientName=${JSON.stringify(clientName)}`,
            `standardRoute=${JSON.stringify(standardRoute)}`,
            `standardTransWays=${JSON.stringify(standardTransWays)}`,
            `standardPurpose=${JSON.stringify(standardPurpose)}`
          ].join("\n")
        );
        */
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

        if (staff01UserId) q += `&staff_01_user_id=${encodeURIComponent(staff01UserId)}`;
        if (staff02UserId) q += `&staff_02_user_id=${encodeURIComponent(staff02UserId)}`;
        if (staff03UserId) q += `&staff_03_user_id=${encodeURIComponent(staff03UserId)}`;
        if (staff02AttendFlg !== undefined && staff02AttendFlg !== null)
          q += `&staff_02_attend_flg=${encodeURIComponent(String(staff02AttendFlg))}`;
        if (staff03AttendFlg !== undefined && staff03AttendFlg !== null)
          q += `&staff_03_attend_flg=${encodeURIComponent(String(staff03AttendFlg))}`;

        router.push(`${hrefBase}${q}`);
      }}
    >
      {label}
    </Button>
  );
}
