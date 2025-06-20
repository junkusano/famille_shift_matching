import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';
import { createLineWorksUser } from '@/lib/lineworksService';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, fullName, email } = body;

  if (!userId || !fullName || !email) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    const result = await createLineWorksUser(token, userId, fullName, email);

    if (result.success === false) {
      console.error('LINE WORKS アカウント作成失敗:', result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    const { error: updateError } = await supabase.from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
      return NextResponse.json({ success: false, error: 'Failed to update Supabase' }, { status: 500 });
    }

    return NextResponse.json({ success: true, tempPassword: result.tempPassword });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
