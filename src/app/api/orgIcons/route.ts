// src/app/api/orgIcons/route.ts

import { supabaseAdmin } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('orgs') // ← テーブル名
    .select('orgunitid, orgunitname, displayorder')
    .order('displayorder', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    // クライアントと一致させるため、名前変換して返す（任意）
    data.map((row) => ({
      id: row.orgunitid,
      org_name: row.orgunitname,
      display_order: row.displayorder,
    }))
  );
}
