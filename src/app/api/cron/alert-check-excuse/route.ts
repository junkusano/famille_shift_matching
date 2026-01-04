// /src/app/api/cron/alert-check-excuse/route.ts
// 3つのチェックを順番に実行するだけのハブ。
// - runPostalCodeCheck
// - runResignerShiftCheck
// - runShiftRecordUnfinishedCheck

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runPostalCodeCheck } from '@/lib/alert_add/postal_code_check';
import { runResignerShiftCheck } from '@/lib/alert_add/resigner_shift_check';
import { runShiftRecordUnfinishedCheck } from '@/lib/alert_add/shift_record_unfinished_check';
import { kodoengoPlanLinkCheck } from "@/lib/alert_add/kodoengo_plan_link_check";
import { lwUserGroupMissingCheck } from "@/lib/alert_add/lw_user_group_missing_check";
import { runShiftCertCheck } from "@/lib/alert_add/shift_cert_check";
import { runCsContractPlanCheck } from "@/lib/alert_add/cs_contract_plan_check"; // ★追加
import { supabaseAdmin } from "@/lib/supabase/service";
import { runShiftTransInfoCheck } from "@/lib/alert_add/shift_trans_info_check";

type CheckResultOk<T> = { ok: true } & T;
type CheckResultErr = { ok: false; error: string };
type CheckResult<T> = CheckResultOk<T> | CheckResultErr;

type Body = {
  ok: boolean; // 全体として全部成功したら true, どれか失敗したら false
  postal_code: CheckResult<{ scanned: number; created: number }>;
  resigner_shift: CheckResult<{ scanned: number; created: number }>;
  shift_record_unfinished: CheckResult<{ scanned: number; created: number }>;
  kodoengo_plan_link_check: CheckResult<{ scanned: number; created: number }>;
  lw_user_group_missing_check: CheckResult<{ scanned: number; created: number }>;
  shift_cert_check: CheckResult<{ scanned: number; alertsCreated: number; alertsUpdated: number }>;
  cs_contract_plan_check: CheckResult<{ scanned: number; alertsCreated: number; alertsUpdated: number }>; // ★追加

  // ★ここを追加：移動系サービス標準移動情報チェックの結果
  shift_trans_info: CheckResult<{
    scannedShiftCount: number;
    scannedClientCount: number;
    targetClientCount: number;
    alertsCreated: number;
    alertsUpdated: number;
  }>;
};

export async function GET(req: NextRequest) {
  const result: Body = {
    ok: true,
    postal_code: { ok: false, error: 'not executed' },
    resigner_shift: { ok: false, error: 'not executed' },
    shift_record_unfinished: { ok: false, error: 'not executed' },
    kodoengo_plan_link_check: { ok: false, error: 'not executed' },
    lw_user_group_missing_check: { ok: false, error: 'not executed' },
    shift_cert_check: { ok: false, error: "not executed" },
    cs_contract_plan_check: { ok: false, error: "not executed" },
    // ★追加：最初は「まだ実行していない」扱い
    shift_trans_info: { ok: false, error: "not executed" },
  };

  try {
    // ★ ここでだけ cron 認証（CRON_SECRET 等）をチェック
    assertCronAuth(req);

    // まず重複整理＆severity再計算（最優先）
    try {
      console.info("[cron][alert_dedupe_recalc] start");
      const { data, error } = await supabaseAdmin.rpc("cron_alert_dedupe_and_recalc");
      if (error) throw error;
      console.info("[cron][alert_dedupe_recalc] end", data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cron][alert_dedupe_recalc] error", msg);
      result.ok = false;
      // ここで止めたければ return してもOK（今は継続させるなら throwしない）
    }

    // ★AUTO DONE 一括クローズ（system の open だけ）
    console.info("[cron][auto_done] start");

    const nowIso = new Date().toISOString();

    // 1) pre-count
    {
      const { count, error } = await supabaseAdmin
        .from("alert_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .in("status_source", ["system"]);

      console.info("[cron][auto_done] pre-count open(system) =", count ?? 0, "err=", error?.message);
    }

    // 2) update（count を必ず取る）
    {
      const { count, error } = await supabaseAdmin
        .from("alert_log")
        .update(
          {
            status: "done",
            status_source: "auto_done",
            updated_at: nowIso,
          },
          { count: "exact" }
        )
        .eq("status", "open")
        .in("status_source", ["system"]);

      console.info("[cron][auto_done] updated count =", count ?? 0, "err=", error?.message);
    }

    // 3) post-count
    {
      const { count, error } = await supabaseAdmin
        .from("alert_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .in("status_source", ["system"]);

      console.info("[cron][auto_done] post-count open(system) =", count ?? 0, "err=", error?.message);
    }

    console.info("[cron][auto_done] end");


    // -1) 契約書・計画書不足チェック
    try {
      console.info('[cron][cs_contract_plan_check] start');
      const r = await runCsContractPlanCheck();
      console.info('[cron][cs_contract_plan_check] end', r);
      result.cs_contract_plan_check = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][cs_contract_plan_check] error', msg);
      result.cs_contract_plan_check = { ok: false, error: msg };
      result.ok = false;
    }

    // 0) 移動系サービス標準移動情報チェック
    try {
      console.info("[cron][shift_trans_info_check] start");
      const r = await runShiftTransInfoCheck();
      console.info("[cron][shift_trans_info_check] end", r);
      result.shift_trans_info = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cron][shift_trans_info_check] error", msg);
      result.shift_trans_info = { ok: false, error: msg };
      result.ok = false;
    }

    // 1) 郵便番号チェック
    try {
      console.info('[cron][postal_code_check] start');
      const r = await runPostalCodeCheck();
      console.info('[cron][postal_code_check] end', r);
      result.postal_code = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][postal_code_check] error', msg);
      result.postal_code = { ok: false, error: msg };
      result.ok = false;
    }

    // 2) 退職者シフト残り
    try {
      console.info('[cron][resigner_shift_check] start');
      const r = await runResignerShiftCheck();
      console.info('[cron][resigner_shift_check] end', r);
      result.resigner_shift = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][resigner_shift_check] error', msg);
      result.resigner_shift = { ok: false, error: msg };
      result.ok = false;
    }

    // 3) 実施記録 未提出
    try {
      console.info('[cron][shift_record_unfinished_check] start');
      const r = await runShiftRecordUnfinishedCheck();
      console.info('[cron][shift_record_unfinished_check] end', r);
      result.shift_record_unfinished = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][shift_record_unfinished_check] error', msg);
      result.shift_record_unfinished = { ok: false, error: msg };
      result.ok = false;
    }

    // 5) LW利用者グループ未作成
    try {
      console.info('[cron][lw_user_group_missing_check] start');
      const r = await lwUserGroupMissingCheck();
      console.info('[cron][lw_user_group_missing_check] end', r);
      result.lw_user_group_missing_check = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][lw_user_group_missing_check] error', msg);
      result.lw_user_group_missing_check = { ok: false, error: msg };
      result.ok = false;
    }

    // 6) シフト資格チェック
    try {
      console.info('[cron][shift_cert_check] start');
      const r = await runShiftCertCheck();
      console.info('[cron][shift_cert_check] end', r);
      result.shift_cert_check = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][shift_cert_check] error', msg);
      result.shift_cert_check = { ok: false, error: msg };
      result.ok = false;
    }

    // 4) 行動援護リンク未登録
    try {
      console.info('[cron][kodoengo_plan_link_check] start');
      const r = await kodoengoPlanLinkCheck();
      console.info('[cron][kodoengo_plan_link_check] end', r);
      result.kodoengo_plan_link_check = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][kodoengo_plan_link_check] error', msg);
      result.kodoengo_plan_link_check = { ok: false, error: msg };
      result.ok = false;
    }

    return NextResponse.json(result, { status: 200 });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron][alert-check-excuse] fatal', msg);
    result.ok = false;
    // どこまで進んだかは result.* にそのまま残る
    return NextResponse.json(result, { status: 500 });
  }
}
