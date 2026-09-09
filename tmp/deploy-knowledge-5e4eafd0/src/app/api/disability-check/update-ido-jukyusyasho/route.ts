//api/disability-check/update-ido-jukyusyasho/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  id: string;               // kaipoke_cs_id
  idoJukyusyasho: string;   // 新しい受給者証番号
};

export async function PUT(req: NextRequest) {
  try {
    const { id, idoJukyusyasho } = (await req.json()) as Body;

    const { error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .update({ ido_jukyusyasho: idoJukyusyasho })
      .eq("kaipoke_cs_id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ido_jukyusyasho] update error", e);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}