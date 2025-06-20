import { NextRequest, NextResponse } from 'next/server';
import { createLineWorksUser } from '@/lib/lineworksService';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const { userId, fullName, email } = await req.json();

    if (!userId || !fullName || !email) {
      return NextResponse.json({ success: false, error: '必須データが不足しています' }, { status: 400 });
    }

    console.log('API側受信データ', { userId, fullName, email });

    const result = await createLineWorksUser(userId, fullName, email);

    if (result.success === false) {
      console.error('LINE WORKS アカウント作成失敗:', result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
      return NextResponse.json({ success: false, error: 'Failed to update Supabase' }, { status: 500 });
    }

    return NextResponse.json({ success: true, tempPassword: result.tempPassword });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
