export type ParkingPlace = {
  id: string; // UUID
  kaipoke_cs_id: string; // 利用者ID
  serial: number; // 駐車場所のシリアル番号
  label: string; // 駐車場所のラベル（自宅、作業所など）
  location_link: string; // Googleマップリンク
  parking_orientation: "北向き" | "東向き" | "南向き" | "西向き" | "北東向き" | "南東向き" | "南西向き" | "北西向き"; // 駐車向き
  permit_required: boolean; // 許可証必要か
  remarks: string; // 備考
  picture1_url: string | null; // 画像1 URL
  picture2_url: string | null; // 画像2 URL
};
