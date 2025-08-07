// app/api/delete-auth-user/route.ts

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from 'next/server';

// Supabase 管理用クライアント（Service Role Key使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { authUserId } = body;

  if (!authUserId) {
    return NextResponse.json({ error: 'authUserId が必要です' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
