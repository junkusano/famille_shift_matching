import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAppBaseUrl } from '@/lib/env/getAppBaseUrl';

export const runtime = 'nodejs';

type Body = { entryId?: string; action?: 'invite' | 'update-email'; email?: string };

export async function POST(req: NextRequest) {
  try {
    const { entryId, action, email: rawEmail } = await req.json() as Body;
    const email = rawEmail?.trim().toLowerCase();
    if (!entryId || !action) return NextResponse.json({ error: 'entryId と action が必要です', code: 'BAD_REQUEST' }, { status: 400 });

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('form_entries').select('id,email,auth_uid,last_name_kanji,first_name_kanji').eq('id', entryId).single();
    if (entryError || !entry) return NextResponse.json({ error: 'Entry が見つかりません', code: 'ENTRY_NOT_FOUND' }, { status: 404 });
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users').select('user_id,auth_user_id,status').eq('entry_id', entryId).maybeSingle();
    if (userError) return NextResponse.json({ error: userError.message, code: 'USER_LOOKUP_FAILED' }, { status: 500 });

    if (action === 'update-email') {
      if (!email) return NextResponse.json({ error: 'メールアドレスが必要です', code: 'EMAIL_REQUIRED' }, { status: 400 });
      const authUid = userRow?.auth_user_id ?? entry.auth_uid;
      if (authUid) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(authUid, { email });
        if (error) return NextResponse.json({ error: error.message, code: 'AUTH_EMAIL_UPDATE_FAILED' }, { status: 502 });
      }
      const { error: dbError } = await supabaseAdmin.from('form_entries').update({ email }).eq('id', entryId);
      if (dbError) return NextResponse.json({ error: dbError.message, code: 'ENTRY_EMAIL_UPDATE_FAILED' }, { status: 500 });
      return NextResponse.json({ success: true, authUpdated: Boolean(authUid), authUid: authUid ?? null });
    }

    if (!email) return NextResponse.json({ error: 'メールアドレスが必要です', code: 'EMAIL_REQUIRED' }, { status: 400 });
    const existingUid = userRow?.auth_user_id ?? entry.auth_uid;
    if (existingUid) {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: `${getAppBaseUrl()}/signup/complete` });
      if (error) return NextResponse.json({ error: error.message, code: 'AUTH_EMAIL_SEND_FAILED' }, { status: 502 });
      return NextResponse.json({ success: true, mode: 'recovery', authUid: existingUid });
    }

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getAppBaseUrl()}/signup/complete`,
      data: { full_name: `${entry.last_name_kanji} ${entry.first_name_kanji}`.trim() },
    });
    if (inviteError || !invited.user?.id) return NextResponse.json({ error: inviteError?.message ?? '認証ユーザーを作成できませんでした', code: 'AUTH_INVITE_FAILED' }, { status: 502 });
    const authUid = invited.user.id;
    const [entryUpdate, userUpdate] = await Promise.all([
      supabaseAdmin.from('form_entries').update({ auth_uid: authUid }).eq('id', entryId),
      userRow ? supabaseAdmin.from('users').update({ auth_user_id: authUid, status: 'auth_mail_send' }).eq('user_id', userRow.user_id) : Promise.resolve({ error: null }),
    ]);
    if (entryUpdate.error || userUpdate.error) return NextResponse.json({ error: entryUpdate.error?.message ?? userUpdate.error?.message ?? 'UIDの保存に失敗しました', code: 'AUTH_UID_SYNC_FAILED' }, { status: 500 });
    return NextResponse.json({ success: true, mode: 'invite', authUid });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '予期しないエラー', code: 'UNEXPECTED_ERROR' }, { status: 500 });
  }
}
