// src/types/roster.ts
export type RosterStaff = {
id: string;
name: string; // 例: 山田太郎
team?: string | null; // orgunitname 等
team_order?: number | null; // org 並び替え用
level?: string | null; // レベル名 or コード
level_order?: number | null; // レベル並び替え用
status?: "ACTIVE" | "RETIRED" | string;
};


export type RosterShiftCard = {
id: string; // `${shift_id}_${staff_id}`
staff_id: string; // 表示行のスタッフID（= RosterStaff.id と一致必須）
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