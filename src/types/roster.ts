// ----------------------------------------------
// src/types/rouster.ts
// ----------------------------------------------
export type RosterStaff = {
id: string;
name: string; // last_name_kanji + first_name_kanji
team?: string | null; // orgunitname
level?: string | null; // level label
status?: "ACTIVE" | "RETIRED";
// for sorting (optional)
team_order?: number | null;
level_order?: number | null;
};


export type RosterShiftCard = {
id: string; // `${shift_id}_${staff_id}` (複数担当は複製)
staff_id: string; // 表示行のスタッフID
start_at: string; // HH:mm
end_at: string; // HH:mm
client_name: string; // 利用者名
service_code: string; // サービスコード
service_name: string; // サービス名
};


export type RosterDailyView = {
date: string; // YYYY-MM-DD
staff: RosterStaff[]; // 行ヘッダ
shifts: RosterShiftCard[]; // カード
};