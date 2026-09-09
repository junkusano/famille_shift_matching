import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAppBaseUrl } from '@/lib/env/getAppBaseUrl';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';

type DeliveryMethod = 'email' | 'sms';
type Body = {
  entryId?: string;
  action?: 'invite' | 'update-email';
  email?: string;
  deliveryMethod?: DeliveryMethod;
};

function smsMessage(actionLink: string): string {
  return [
    '【マイ・ファミーユ】',
    'ログイン設定はこちらからお願いします。',
    actionLink,
    'ご不明点：090-9140-2642',
  ].join('\n');
}

function signupCompleteRedirect(flow: 'invite' | 'recovery'): string {
  return `${getAppBaseUrl()}/signup/complete?authFlow=${flow}`;
}

function smsSignupCompleteUrl(flow: 'invite' | 'recovery', tokenHash: string): string {
  const url = new URL('/signup/complete', getAppBaseUrl());
  url.searchParams.set('authFlow', flow);
  url.searchParams.set('type', flow);
  // fragmentはHTTPリクエストに含まれないため、短期トークンをアプリやアクセスログへ渡さない。
  url.hash = new URLSearchParams({ token_hash: tokenHash }).toString();
  return url.toString();
}

export async function POST(req: NextRequest) {
  try {
    const { entryId, action, email: rawEmail, deliveryMethod: rawDeliveryMethod } = await req.json() as Body;
    const email = rawEmail?.trim().toLowerCase();
    const deliveryMethod: DeliveryMethod = rawDeliveryMethod === 'sms' ? 'sms' : 'email';
    if (!entryId || !action) return NextResponse.json({ error: 'entryId と action が必要です', code: 'BAD_REQUEST' }, { status: 400 });

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('form_entries').select('id,email,phone,auth_uid,last_name_kanji,first_name_kanji').eq('id', entryId).single();
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
    const storedAuthUids = [...new Set([userRow?.auth_user_id, entry.auth_uid].filter((authUid): authUid is string => Boolean(authUid)))];
    let existingUid: string | null = null;

    // Auth だけが削除され、業務データに古い ID が残っている場合は再招待として扱う。
    // 業務データの存在だけで recovery を選択しない。
    for (const storedAuthUid of storedAuthUids) {
      const { data: authLookup, error: authLookupError } = await supabaseAdmin.auth.admin.getUserById(storedAuthUid);
      if (authLookupError) {
        if (authLookupError.status === 404) {
          console.info('[entry-auth] stale auth UID detected', { entryId });
          continue;
        } else {
          console.error('[entry-auth] auth user lookup failed', { entryId, error: authLookupError.message });
          return NextResponse.json({ error: '認証ユーザーの確認に失敗しました', code: 'AUTH_USER_LOOKUP_FAILED' }, { status: 502 });
        }
      }
      if (authLookup.user) {
        existingUid = authLookup.user.id;
        break;
      }
    }

    // SMS選択時は、既存のSupabase認証メールを送らない。
    // 同一トークン種別でメール送信とgenerateLinkを併用すると、先に発行したURLが無効になるため。
    if (deliveryMethod === 'sms') {
      const phone = typeof entry.phone === 'string' ? entry.phone.trim() : '';
      if (!phone) {
        console.info('[entry-auth] sms skipped', { entryId, reason: 'NO_PHONE_NUMBER' });
        return NextResponse.json({
          success: false,
          deliveryMethod: 'sms',
          reason: 'NO_PHONE_NUMBER',
        }, { status: 400 });
      }

      console.info('[entry-auth] start', { entryId, deliveryMethod: 'sms' });
      const linkType = existingUid ? 'recovery' : 'invite';
      const { data: generated, error: generateError } = existingUid
        ? await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: signupCompleteRedirect('recovery') },
        })
        : await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: {
            redirectTo: signupCompleteRedirect('invite'),
            data: { full_name: `${entry.last_name_kanji} ${entry.first_name_kanji}`.trim() },
          },
        });

      if (generateError || !generated.user?.id || !generated.properties?.hashed_token) {
        console.error('[entry-auth] auth link generation failed', {
          entryId,
          type: linkType,
          error: generateError?.message ?? 'missing generated link data',
        });
        return NextResponse.json({
          success: false,
          deliveryMethod: 'sms',
          reason: 'AUTH_LINK_GENERATION_FAILED',
        }, { status: 502 });
      }

      console.info('[entry-auth] auth link generated', { entryId, type: linkType });

      if (!existingUid) {
        const authUid = generated.user.id;
        const [entryUpdate, userUpdate] = await Promise.all([
          supabaseAdmin.from('form_entries').update({ auth_uid: authUid }).eq('id', entryId),
          userRow ? supabaseAdmin.from('users').update({ auth_user_id: authUid, status: 'auth_mail_send' }).eq('user_id', userRow.user_id) : Promise.resolve({ error: null }),
        ]);
        if (entryUpdate.error || userUpdate.error) {
          console.error('[entry-auth] auth UID sync failed', {
            entryId,
            error: entryUpdate.error?.message ?? userUpdate.error?.message ?? 'unknown error',
          });
          return NextResponse.json({
            success: false,
            deliveryMethod: 'sms',
            reason: 'AUTH_UID_SYNC_FAILED',
          }, { status: 500 });
        }
      }

      const smsResult = await sendSms({
        to: phone,
        // SMSではブラウザ側で一回限りのtoken_hashをverifyOtpし、
        // /signup/complete のlocalStorageセッションを確立する。
        body: smsMessage(smsSignupCompleteUrl(linkType, generated.properties.hashed_token)),
      });
      if (smsResult.status !== 'ok') {
        console.error('[entry-auth] sms send failed', { entryId, reason: smsResult.status === 'skipped' ? smsResult.reason : 'send_error' });
        return NextResponse.json({
          success: false,
          deliveryMethod: 'sms',
          reason: 'SMS_SEND_FAILED',
        }, { status: 502 });
      }

      console.info('[entry-auth] sms send', { entryId, success: true });
      return NextResponse.json({ success: true, deliveryMethod: 'sms' });
    }

    // 既存のメール送信処理。deliveryMethod 未指定時もここへ入り、従来の挙動を維持する。
    if (existingUid) {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: signupCompleteRedirect('recovery') });
      if (error) return NextResponse.json({ error: error.message, code: 'AUTH_EMAIL_SEND_FAILED' }, { status: 502 });
      return NextResponse.json({ success: true, mode: 'recovery', authUid: existingUid, deliveryMethod: 'email' });
    }

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: signupCompleteRedirect('invite'),
      data: { full_name: `${entry.last_name_kanji} ${entry.first_name_kanji}`.trim() },
    });
    if (inviteError || !invited.user?.id) return NextResponse.json({ error: inviteError?.message ?? '認証ユーザーを作成できませんでした', code: 'AUTH_INVITE_FAILED' }, { status: 502 });
    const authUid = invited.user.id;
    const [entryUpdate, userUpdate] = await Promise.all([
      supabaseAdmin.from('form_entries').update({ auth_uid: authUid }).eq('id', entryId),
      userRow ? supabaseAdmin.from('users').update({ auth_user_id: authUid, status: 'auth_mail_send' }).eq('user_id', userRow.user_id) : Promise.resolve({ error: null }),
    ]);
    if (entryUpdate.error || userUpdate.error) return NextResponse.json({ error: entryUpdate.error?.message ?? userUpdate.error?.message ?? 'UIDの保存に失敗しました', code: 'AUTH_UID_SYNC_FAILED' }, { status: 500 });
    return NextResponse.json({ success: true, mode: 'invite', authUid, deliveryMethod: 'email' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '予期しないエラー', code: 'UNEXPECTED_ERROR' }, { status: 500 });
  }
}
