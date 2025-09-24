// app/api/shift-coordinate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';


type AssignResult = {
status: 'assigned'|'replaced'|'error'|'noop';
slot?: 'staff_01'|'staff_02'|'staff_03';
message?: string;
};


export async function POST(req: NextRequest) {
try {
const body = await req.json();
const {
// shift 基本
shift_id,
kaipoke_cs_id,
shift_start_date,
shift_start_time,
shift_end_time,
service_code,
postal_code_3,
client_name,
// 依頼者情報
requested_by_user_id, // = auth_user_id
requested_kaipoke_user_id, // カイポケ上のユーザー
accompany = true, // 同行希望
role_code = null, // 任意
// RPA テンプレ
template_id = '92932ea2-b450-4ed0-a07b-4888750da641',
} = body;


if (!shift_id || !requested_by_user_id) {
return NextResponse.json({ error: 'bad request' }, { status: 400 });
}


// 1) shift を先に確定（RPC）
const { data: assignRes, error: assignErr } = await supabaseAdmin
.rpc('assign_user_to_shift', {
p_shift_id: shift_id,
p_user_id: requested_by_user_id,
p_role_code: role_code,
p_accompany: !!accompany,
});


if (assignErr) {
console.error('RPC Error', assignErr);
return NextResponse.json({ error: '割当処理に失敗しました' }, { status: 500 });
}


const res = (assignRes as AssignResult) ?? { status: 'error' };
if (res.status === 'error') {
// 仕様どおりのメッセージ
const msg = res.message || '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
return NextResponse.json({ error: msg }, { status: 409 });
}


// 2) 成功時のみ RPA リクエスト登録
const request_details = {
shift_id,
kaipoke_cs_id,
shift_start_date,
shift_start_time,
shift_end_time,
service_code,
postal_code_3,
client_name,
requested_by: requested_by_user_id,
requested_kaipoke_user_id,
attend_request: !!accompany,
};


const { error } = await supabaseAdmin
.from('rpa_command_requests')
.insert({
template_id,
requester_id: requested_by_user_id,
approver_id: requested_by_user_id,
status: 'approved',
request_details,
});


if (error) {
console.error('Supabase Insert Error:', error);
return NextResponse.json({ error: error.message }, { status: 500 });
}


return NextResponse.json({ ok: true, assign: res });
} catch (e) {
console.error('API Error', e);
return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
}
}