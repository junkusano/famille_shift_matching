import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service'; // ✅ サーバー用クライアントに変更

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      kaipoke_cs_id,
      service_code,
      shift_start_date,
      shift_start_time,
      staff_01_user_id,
      staff_02_user_id,
      staff_03_user_id,
      requested_by
    } = body;

    if (!kaipoke_cs_id || !service_code || !shift_start_date || !shift_start_time || !requested_by) {
      return NextResponse.json({ error: '必須項目が不足しています。' }, { status: 400 });
    }

    const payload = {
      template_id: '92932ea2-b450-4ed0-a07b-4888750da641',
      request_detail: {
        kaipoke_cs_id,
        service_code,
        shift_start_date,
        shift_start_time,
        staff_01_user_id,
        staff_02_user_id,
        staff_03_user_id,
        requested_by
      },
      status: 'approved',
      created_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('rpa_command_request').insert(payload);

    if (error) {
      console.error('Supabase Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: '登録に成功しました' });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
