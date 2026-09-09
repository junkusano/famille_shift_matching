// lib/addStaffLog.ts

import { supabase } from './supabaseClient';

export type AddStaffLogParams = {
    staff_id: string;
    action_at: string;           // 'YYYY-MM-DDTHH:mm' 形式など
    action_detail: string;
    registered_by: string;
};

export async function addStaffLog(params: AddStaffLogParams): Promise<{ error?: string }> {
    const { staff_id, action_at, action_detail, registered_by } = params;
    const { error } = await supabase.from('staff_log').insert([
        { staff_id, action_at, action_detail, registered_by }
    ]);
    if (error) {
        return { error: error.message };
    }
    return {};
}
