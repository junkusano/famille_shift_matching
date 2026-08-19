import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/service';
import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMentionMessage, type MentionTarget } from '@/lib/lineworks/sendLWBotMentionMessage';
import { regularStartMonth, timeOverlaps } from '@/lib/shift/regularShift';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShiftRow = {
  shift_id: number | string;
  kaipoke_cs_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string | null;
  name?: string | null;
};

type WeeklyTemplateRow = {
  template_id: number;
  kaipoke_cs_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  service_code: string | null;
  active: boolean | null;
  is_biweekly?: boolean | null;
  nth_weeks?: number[] | null;
};

async function actor() {
  const client = createRouteHandlerClient({ cookies });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('user_id,lw_userid,manager_lw_userid')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle();
  return data ? { ...data, authUserId: auth.user.id } : null;
}

async function findCandidates(source: ShiftRow, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('shift_weekly_template')
    .select('template_id,kaipoke_cs_id,weekday,start_time,end_time,service_code,active,is_biweekly,nth_weeks')
    .eq('kaipoke_cs_id', source.kaipoke_cs_id)
    .eq('service_code', source.service_code)
    .eq('active', true)
    .order('template_id', { ascending: true })
    .limit(500);
  if (error) throw error;

  const requests = await supabaseAdmin
    .from('regular_shift_requests')
    .select('weekly_shift_id')
    .eq('user_id', userId)
    .neq('status', 'cancelled');
  if (requests.error) throw requests.error;
  const requested = new Set((requests.data ?? []).map((row) => String(row.weekly_shift_id)));

  return ((data ?? []) as WeeklyTemplateRow[])
    .filter((row) => timeOverlaps({ shift_start_time: row.start_time, shift_end_time: row.end_time }, source))
    .slice(0, 20)
    .map((row) => ({
      weekly_shift_id: String(row.template_id),
      shift_start_date: source.shift_start_date,
      shift_start_time: row.start_time,
      shift_end_time: row.end_time,
      service_code: row.service_code,
      client_name: null,
      recurring_label: row.nth_weeks?.length ? `第${row.nth_weeks.join('・')}週` : row.is_biweekly ? '隔週' : '毎週',
      requested: requested.has(String(row.template_id)),
    }));
}

export async function GET(req: Request) {
  try {
    const me = await actor();
    if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const id = new URL(req.url).searchParams.get('shift_id');
    if (!id) return NextResponse.json({ error: 'shift_id is required' }, { status: 400 });
    const { data: source, error } = await supabaseAdmin.from('shift').select('*').eq('shift_id', id).maybeSingle();
    if (error) throw error;
    if (!source) return NextResponse.json({ candidates: [] });
    return NextResponse.json({ available_from_month: regularStartMonth(), candidates: await findCandidates(source as ShiftRow, String(me.user_id)) });
  } catch (error) {
    console.error('[regular-shift-requests][GET]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const me = await actor();
    if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json() as { source_shift_id?: string; weekly_shift_id?: string };
    if (!body.source_shift_id || !body.weekly_shift_id) return NextResponse.json({ error: 'source_shift_id and weekly_shift_id are required' }, { status: 400 });

    const [{ data: source }, { data: weekly }] = await Promise.all([
      supabaseAdmin.from('shift').select('*').eq('shift_id', body.source_shift_id).maybeSingle(),
      supabaseAdmin.from('shift_weekly_template').select('*').eq('template_id', body.weekly_shift_id).maybeSingle(),
    ]);
    if (!source || !weekly) return NextResponse.json({ error: 'shift not found' }, { status: 404 });

    const candidates = await findCandidates(source as ShiftRow, String(me.user_id));
    if (!candidates.some((candidate) => candidate.weekly_shift_id === String(weekly.template_id))) {
      return NextResponse.json({ error: 'weekly shift is not eligible' }, { status: 400 });
    }

    const { data: saved, error } = await supabaseAdmin.from('regular_shift_requests').insert({
      user_id: String(me.user_id),
      weekly_shift_id: Number(weekly.template_id),
      source_shift_id: Number(body.source_shift_id),
      available_from_month: regularStartMonth(),
      status: 'requested',
    }).select('id').single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
      throw error;
    }

    let notified = false;
    try {
      const { data: channel } = await supabaseAdmin.from('group_lw_channel_view').select('channel_id').eq('group_account', source.kaipoke_cs_id).maybeSingle();
      if (channel?.channel_id) {
        const mentions: MentionTarget[] = [
          ...(me.lw_userid ? [{ userId: String(me.lw_userid), label: '希望者' }] : []),
          ...(me.manager_lw_userid ? [{ userId: String(me.manager_lw_userid), label: 'マネジャー' }] : []),
        ];
        const text = `<m userId="${me.manager_lw_userid ?? me.lw_userid ?? ''}">マネジャー</m>\nレギュラーシフト希望が登録されました。\n希望者: <m userId="${me.lw_userid ?? ''}">さん</m>\n週間シフト: ${weekly.weekday}曜 ${String(weekly.start_time).slice(0, 5)}〜${String(weekly.end_time).slice(0, 5)}\n対象シフト: ${source.shift_start_date} ${String(source.shift_start_time).slice(0, 5)}〜${String(source.shift_end_time).slice(0, 5)}\n利用者: ${source.name ?? '不明'}\nレギュラー開始可能: ${regularStartMonth().slice(0, 7)}`;
        await sendLWBotMentionMessage({
          botId: process.env.LINEWORKS_BOT_NO || process.env.WORKS_BOT_NO || '6807751',
          channelId: String(channel.channel_id),
          accessToken: await getAccessToken(),
          mentions,
          buildText: () => text,
        });
        notified = true;
        await supabaseAdmin.from('regular_shift_requests').update({ lineworks_notified_at: new Date().toISOString() }).eq('id', saved.id);
      }
    } catch (notifyError) {
      console.error('[regular-shift-requests][notify]', notifyError);
    }
    return NextResponse.json({ ok: true, id: saved.id, notified });
  } catch (error) {
    console.error('[regular-shift-requests][POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'internal error' }, { status: 500 });
  }
}
