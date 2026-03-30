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
    id: string;
    staff_id: string;
    start_at: string;
    end_at: string;
    client_name: string;
    service_code: string;
    service_name: string;
    kaipoke_cs_id?: string | number;
    dsp_short?: string | null;
    staff_slot?: 1 | 2 | 3;

    gender_request_name?: string | null;
    male_flg?: boolean | null;
    female_flg?: boolean | null;
};

export type RosterDailyView = {
    date: string; // YYYY-MM-DD
    staff: RosterStaff[]; // 行ヘッダ
    shifts: RosterShiftCard[]; // カード
};