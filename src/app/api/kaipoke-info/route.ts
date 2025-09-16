//api/kaipoke-info

import { supabaseAdmin } from '@/lib/supabase/service';  // サーバーサイド用のsupabaseをインポート
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // cs_kaipoke_info からデータを取得
    const { data, error } = await supabaseAdmin
      .from('cs_kaipoke_info')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Unexpected error occurred' }, { status: 500 });
  }
}

