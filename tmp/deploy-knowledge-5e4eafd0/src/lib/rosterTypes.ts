// ----------------------------------------------
// lib/roster/rosterTypes.ts
// ----------------------------------------------
export type RosterStaff = {
  id: string;
  name: string;
  team?: string | null;
  level?: string | null;
  status?: "ACTIVE" | "RETIRED";
};

export type RosterShiftCard = {
  id: string;           // shift_id と staff_id を合成（複数担当は複製）
  staff_id: string;     // 表示行のスタッフID
  start_at: string;     // HH:mm
  end_at: string;       // HH:mm
  client_name: string;  // 利用者名
  service_code: string; // サービスコード
  service_name: string; // サービス名
};

export type RosterDailyView = {
  date: string;              // YYYY-MM-DD
  staff: RosterStaff[];      // 行ヘッダ
  shifts: RosterShiftCard[]; // カード
};