import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, nullableText, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";
const GROUP_KEY = "taimee_recruit_sms";
const KEY_NAME = "default_template";

function failure(error: unknown) {
  if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[rpa/taimee/sms/template] failed", error);
  return NextResponse.json({ error: "SMSテンプレートの処理に失敗しました" }, { status: 500 });
}

export async function GET() {
  try {
    await requireTaimeeRpaOperator();
    const { data, error } = await supabaseAdmin.from("env_variables").select("value")
      .eq("group_key", GROUP_KEY).eq("key_name", KEY_NAME).maybeSingle();
    if (error) throw error;
    if (!data?.value) return NextResponse.json({ error: "SMSテンプレートが未設定です" }, { status: 404 });
    return NextResponse.json({ ok: true, template: data.value });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator();
    const body = await request.json() as { template?: unknown };
    const template = nullableText(body.template, 4000);
    if (!template) return NextResponse.json({ error: "SMS本文が不正です" }, { status: 400 });
    const { error } = await supabaseAdmin.from("env_variables").upsert({
      group_key: GROUP_KEY, key_name: KEY_NAME, value: template, updated_at: new Date().toISOString(),
    }, { onConflict: "group_key,key_name" });
    if (error) throw error;
    return NextResponse.json({ ok: true, template });
  } catch (error) { return failure(error); }
}
