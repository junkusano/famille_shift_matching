// =============================================================
// src/app/api/cm/fax/[id]/offices/route.ts
// FAXに事業所を追加するAPI
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/fax/offices");

// =============================================================
// POST: 事業所追加
// =============================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const faxId = parseInt(id, 10);
    if (isNaN(faxId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fax ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { office_id, register_fax_proxy } = body;

    // ---------------------------------------------------------
    // バリデーション
    // ---------------------------------------------------------
    if (!office_id) {
      return NextResponse.json(
        { ok: false, error: "office_id is required" },
        { status: 400 }
      );
    }

    logger.info("事業所追加開始", { faxId, office_id, register_fax_proxy });

    // ---------------------------------------------------------
    // FAX存在確認
    // ---------------------------------------------------------
    const { data: faxData, error: faxError } = await supabaseAdmin
      .from("cm_fax_received")
      .select("id, fax_number")
      .eq("id", faxId)
      .single();

    if (faxError || !faxData) {
      logger.error("FAX取得エラー", { error: faxError?.message });
      return NextResponse.json(
        { ok: false, error: "FAX not found" },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 既存の紐付け確認
    // ---------------------------------------------------------
    const { data: existingOffices } = await supabaseAdmin
      .from("cm_fax_received_offices")
      .select("id, office_id, is_primary")
      .eq("fax_received_id", faxId);

    const alreadyLinked = (existingOffices || []).some(
      (o) => o.office_id === office_id
    );

    if (alreadyLinked) {
      return NextResponse.json(
        { ok: false, error: "この事業所は既に紐付けられています" },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // ログインユーザー取得
    // ---------------------------------------------------------
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || "unknown";

    // ---------------------------------------------------------
    // プライマリ判定（最初の事業所ならプライマリ）
    // ---------------------------------------------------------
    const isPrimary = !existingOffices || existingOffices.length === 0;

    // ---------------------------------------------------------
    // 事業所紐付け追加
    // ---------------------------------------------------------
    const { error: insertError } = await supabaseAdmin
      .from("cm_fax_received_offices")
      .insert({
        fax_received_id: faxId,
        office_id,
        is_primary: isPrimary,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      logger.error("事業所紐付けエラー", { error: insertError.message });
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // FAX代理番号登録（オプション）
    // ---------------------------------------------------------
    let faxProxyRegistered = false;
    if (register_fax_proxy && faxData.fax_number) {
      const { error: proxyError } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .update({ fax_proxy: faxData.fax_number })
        .eq("id", office_id);

      if (proxyError) {
        logger.warn("FAX代理番号登録エラー", { error: proxyError.message });
      } else {
        faxProxyRegistered = true;
        logger.info("FAX代理番号登録完了", {
          office_id,
          fax_proxy: faxData.fax_number,
        });
      }
    }

    // ---------------------------------------------------------
    // cm_fax_received.office_id も更新（プライマリの場合）
    // ---------------------------------------------------------
    if (isPrimary) {
      const { error: updateError } = await supabaseAdmin
        .from("cm_fax_received")
        .update({
          office_id,
          office_assigned_by: userId,
          office_assigned_at: new Date().toISOString(),
        })
        .eq("id", faxId);

      if (updateError) {
        logger.warn("FAX事業所更新エラー", { error: updateError.message });
      }
    }

    logger.info("事業所追加完了", {
      faxId,
      office_id,
      is_primary: isPrimary,
      fax_proxy_registered: faxProxyRegistered,
    });

    return NextResponse.json({
      ok: true,
      fax_received_id: faxId,
      office_id,
      is_primary: isPrimary,
      fax_proxy_registered: faxProxyRegistered,
    });
  } catch (e) {
    logger.error("事業所追加例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}