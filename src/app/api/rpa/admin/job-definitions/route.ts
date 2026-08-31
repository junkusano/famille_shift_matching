import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { isRecord } from '@/lib/rpa-runner/validation';
import { isRpaTaimeeError, requireTaimeeRpaOperator } from '@/lib/rpa/taimee';

function errorResponse(error: unknown) {
  if (isRpaTaimeeError(error)) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  return NextResponse.json({ ok: false, error: 'Job定義を処理できませんでした。' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const { data, error } = await supabaseAdmin.from('rpa_job_definitions').select('*').order('name');
    if (error) throw error;
    return NextResponse.json({ ok: true, definitions: data ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.id !== 'string' || typeof body.is_enabled !== 'boolean' || !isRecord(body.schedule) || !Array.isArray(body.schedule.times) || !body.schedule.times.every((time) => typeof time === 'string' && /^\d{2}:\d{2}$/.test(time))) {
      return NextResponse.json({ ok: false, error: 'Job定義の内容が不正です。' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('rpa_job_definitions')
      .update({ is_enabled: body.is_enabled, schedule: { timezone: 'Asia/Tokyo', times: body.schedule.times } })
      .eq('id', body.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: 'Job定義が見つかりません。' }, { status: 404 });
    return NextResponse.json({ ok: true, definition: data });
  } catch (error) { return errorResponse(error); }
}
