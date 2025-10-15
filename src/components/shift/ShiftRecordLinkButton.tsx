// components/shift/ShiftRecordLinkButton.tsx
"use client";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Propsの型定義
interface ShiftRecordLinkButtonProps {
  shiftId: string;
  clientName?: string;
  tokuteiComment?: string | null;
  // --- Propsの型定義に3項目を追加 ---
  standardRoute?: string | null;
  standardTransWays?: string | null;
  standardPurpose?: string | null;
  staff01UserId?: string | null;
  staff02UserId?: string | null;
  staff03UserId?: string | null;
  staff02AttendFlg?: string | number | boolean | null;
  staff03AttendFlg?: string | number | boolean | null;
  judoIdo?: string | number | null;
  label?: string;
  hrefBase?: string;
  className?: string;
  id?: string;
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"; // ★ 追加（必要なものだけ）
}

export default function ShiftRecordLinkButton({
  className,
  id,
  variant = "ghost",        // ★ 追加（デフォは従来通り）
  shiftId,
  clientName,
  tokuteiComment,
  // --- ここに3項目を追加し、Propsから値を取り出します ---
  standardRoute,
  standardTransWays,
  standardPurpose,
  staff01UserId, staff02UserId, staff03UserId,
  staff02AttendFlg, staff03AttendFlg,
  judoIdo,
  label = "訪問記録",
  hrefBase = "/portal/shift-records",
}: ShiftRecordLinkButtonProps) { // 型はここで指定
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  // いま居るURLを復元用に作る（例: /portal/shift-view?user_id=...）
  const currentUrl = typeof window !== "undefined"
    ? `${pathname}${search?.toString() ? `?${search.toString()}` : ""}`
    : undefined;

  return (
    <Button
      id={id}
      className={className}
      variant={variant}
      onClick={() => {

        let q =
          `?shift_id=${encodeURIComponent(shiftId)}`
        if (clientName) {
          q += `&client_name=${encodeURIComponent(clientName)}`;
        }
        if (tokuteiComment) {
          q += `&tokutei_comment=${encodeURIComponent(tokuteiComment)}`;
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
        if (currentUrl) {
          // URLクエリに積むだけでなく、セーフティに sessionStorage にも保持
          try { sessionStorage.setItem("sr:return_to", currentUrl); } catch { }
          q += `&return_to=${encodeURIComponent(currentUrl)}`;
        }
        if (judoIdo !== undefined && judoIdo !== null && String(judoIdo).trim() !== "") {
          q += `&judo_ido=${encodeURIComponent(String(judoIdo))}`;
        }

        /*
        alert(
          [
            `[ShiftRecordLinkButton] push params`,
            `hrefBase: ${hrefBase}`,
            `q: ${q}`,
            `--- raw props ---`,
            `shiftId: ${shiftId}`,
            `judo_ido: ${judoIdo ?? ""}`,
            `clientName: ${clientName ?? ""}`,
            `standard_route: ${standardRoute ?? ""}`,
            `standard_trans_ways: ${standardTransWays ?? ""}`,
            `standard_purpose: ${standardPurpose ?? ""}`,
            `staff_01_user_id: ${staff01UserId ?? ""}`,
            `staff_02_user_id: ${staff02UserId ?? ""}`,
            `staff_03_user_id: ${staff03UserId ?? ""}`,
            `staff_02_attend_flg: ${String(staff02AttendFlg ?? "")}`,
            `staff_03_attend_flg: ${String(staff03AttendFlg ?? "")}`,
          ].join("\n")
        );
        */


        router.push(`${hrefBase}${q}`);
      }}
    >
      {label}
    </Button>
  );
}
