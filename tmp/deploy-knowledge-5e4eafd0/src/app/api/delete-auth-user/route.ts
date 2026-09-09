// app/api/delete-auth-user/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Supabase 管理用クライアント（Service Role Key使用）
export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const { authUserId, entryId } = body as { authUserId?: string; entryId?: string };

  if (!entryId) {
    return NextResponse.json({ error: 'entryId が必要です', code: 'ENTRY_ID_REQUIRED' }, { status: 400 });
  }

  const { data: entry, error: entryError } = await supabaseAdmin
    .from('form_entries')
    .select('id,auth_uid')
    .eq('id', entryId)
    .single();
  if (entryError || !entry) {
    return NextResponse.json({ error: 'Entry が見つかりません', code: 'ENTRY_NOT_FOUND' }, { status: 404 });
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('user_id,auth_user_id')
    .eq('entry_id', entryId)
    .maybeSingle();
  if (userError) {
    return NextResponse.json({ error: userError.message, code: 'USER_LOOKUP_FAILED' }, { status: 500 });
  }

  // DB の片方だけが古い状態でも、Entry と users のどちらかに紐づく UID を使う。
  const targetAuthId = userRow?.auth_user_id ?? entry.auth_uid ?? authUserId;
  if (!targetAuthId) {
    return NextResponse.json({ success: true, alreadyAbsent: true, message: '認証情報は既に存在しません。' });
  }

  const { data: authLookup, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(targetAuthId);
  if (lookupError && !/not found|not exist/i.test(lookupError.message)) {
    return NextResponse.json({ error: lookupError.message, code: 'AUTH_LOOKUP_FAILED' }, { status: 502 });
  }

  if (authLookup.user) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetAuthId);
    if (error) {
      return NextResponse.json({ error: error.message, code: 'AUTH_DELETE_FAILED' }, { status: 502 });
    }
  }

  // Auth を消した後に必ず両方の参照を外す。古い UID を残さない。
  const [entryUpdate, userUpdate] = await Promise.all([
    supabaseAdmin.from('form_entries').update({ auth_uid: null }).eq('id', entryId),
    userRow ? supabaseAdmin.from('users').update({ auth_user_id: null, status: 'account_id_create' }).eq('user_id', userRow.user_id) : Promise.resolve({ error: null }),
  ]);
  if (entryUpdate.error || userUpdate.error) {
    return NextResponse.json({
      error: entryUpdate.error?.message ?? userUpdate.error?.message ?? 'DB同期に失敗しました',
      code: 'AUTH_DELETED_DB_SYNC_FAILED',
    }, { status: 500 });
  }

  return NextResponse.json({ success: true, alreadyAbsent: !authLookup.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : '予期しないエラー';
    return NextResponse.json({ error: message, code: 'UNEXPECTED_ERROR' }, { status: 500 });
  }
}
