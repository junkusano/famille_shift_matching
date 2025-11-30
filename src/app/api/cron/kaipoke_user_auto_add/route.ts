// src/app/api/cron/kaipoke_user_auto_add/route.ts
//
// user_entry_united_view_single を使って、
//   user_id が NOT NULL
//   かつ status が NULL / 'removed_from_lineworks_kaipoke' 以外
//   かつ kaipoke_user_id が NULL
// のレコードに対して、カイポケユーザー追加の RPA リクエストを自動発行する cron 用 API

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import {
  buildKaipokeUserRequestDetails,
  insertKaipokeUserRpaRequest,
  type KaipokeUserRequestDetails,
  type InsertKaipokeUserRpaRequestResult,
} from "@/lib/rpa_request/kaipoke_user_add";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// entry_detail と同じテンプレート ID（必要なら .env 経由にしても OK）
const KAIPOKE_TEMPLATE_ID = "a3ce7551-90f0-4e03-90bb-6fa8534fd31b";

// cron 実行時の requester / approver 用ユーザー ID（Supabase auth.users.id）
// 必ず環境変数で設定しておく
const CRON_REQUESTER_ID = process.env.KAIPOKE_RPA_CRON_USER_ID ?? "";

type EntryUnitedRow = {
  user_id: string | null;
  kaipoke_user_id: string | null;
  status: string | null;

  // form_entries 側から来るカラム
  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  gender?: string | null;

  // orgs からの名称
  orgunitname?: string | null;

  [key: string]: unknown;
};

type JobResult = {
  ok: boolean;
  dryRun: boolean;
  scanned: number;
  created: number;
  skipped: number;
  errors: { user_id: string; message: string }[];
};

async function runJob(params: {
  dryRun: boolean;
  limit: number;
}): Promise<JobResult> {
  const { dryRun, limit } = params;

  if (!CRON_REQUESTER_ID) {
    const msg = "KAIPOKE_RPA_CRON_USER_ID が未設定です";
    console.error("[kaipoke_user_auto_add]", msg);
    return {
      ok: false,
      dryRun,
      scanned: 0,
      created: 0,
      skipped: 0,
      errors: [{ user_id: "-", message: msg }],
    };
  }

  // 対象を user_entry_united_view_single から取得
  const { data, error } = await supabase
    .from("user_entry_united_view_single")
    .select(
      [
        "user_id",
        "kaipoke_user_id",
        "status",
        "last_name_kanji",
        "first_name_kanji",
        "last_name_kana",
        "first_name_kana",
        "gender",
        "orgunitname",
      ].join(","),
    )
    .is("kaipoke_user_id", null)
    .not("user_id", "is", null)
    .neq("status", "removed_from_lineworks_kaipoke")
    .not("status", "is", null)
    .limit(limit);

  if (error) {
    console.error("[kaipoke_user_auto_add] users fetch error", error);
    return {
      ok: false,
      dryRun,
      scanned: 0,
      created: 0,
      skipped: 0,
      errors: [{ user_id: "-", message: error.message }],
    };
  }

  // supabase の型都合で一度 unknown を挟んでキャスト
  const rows = ((data ?? []) as unknown) as EntryUnitedRow[];

  const result: JobResult = {
    ok: true,
    dryRun,
    scanned: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    const userIdStr = row.user_id;
    if (!userIdStr) {
      result.skipped += 1;
      continue;
    }

    // 念のため：もし既に kaipoke_user_id が入っていればスキップ
    if (row.kaipoke_user_id) {
      result.skipped += 1;
      continue;
    }

    // すでに同じユーザー向けの RPA リクエストが存在しないかチェック
    if (!dryRun) {
      const { data: existing, error: existErr } = await supabase
        .from("rpa_command_requests")
        .select("id,status")
        .eq("template_id", KAIPOKE_TEMPLATE_ID)
        .contains("request_details" as never, {
          user_id: userIdStr,
        } as KaipokeUserRequestDetails)
        .limit(1);

      if (existErr) {
        console.error(
          "[kaipoke_user_auto_add] existing rpa check error",
          userIdStr,
          existErr,
        );
        result.errors.push({
          user_id: userIdStr,
          message: existErr.message,
        });
        result.ok = false;
        continue;
      }

      if (existing && existing.length > 0) {
        // 既にリクエスト済み
        result.skipped += 1;
        continue;
      }
    }

    // --- 氏名などフィールド組み立て（View 由来のカラム名に合わせる） ---
    const lastNameKanji = row.last_name_kanji ?? "";
    const firstNameKanji = row.first_name_kanji ?? "";

    const lastNameKanaRaw = row.last_name_kana ?? "";
    const firstNameKanaRaw = row.first_name_kana ?? "";
    const gender = row.gender ?? null;

    // employment_type_name は View に無いので空文字（必要なら拡張）
    const employmentTypeName = "";

    // orgunitname をそのまま事業所名として利用
    const orgUnitName = row.orgunitname ?? "";

    // prefix 付きかなは使わず、そのまま last_name_kana を渡す
    const lastNameKanaForRequest = lastNameKanaRaw;

    const requestDetails = buildKaipokeUserRequestDetails({
      userId: userIdStr,
      lastNameKanji,
      lastNameKana: lastNameKanaForRequest,
      firstNameKanji,
      firstNameKana: firstNameKanaRaw,
      gender,
      employmentTypeName,
      orgUnitName,
      passwordSourceKana: lastNameKanaRaw,
    });

    if (dryRun) {
      // 実際には登録しないが「作る予定だった件数」としてカウント
      result.created += 1;
      continue;
    }

    const insertResult: InsertKaipokeUserRpaRequestResult =
      await insertKaipokeUserRpaRequest({
        supabase,
        templateId: KAIPOKE_TEMPLATE_ID,
        requesterId: CRON_REQUESTER_ID,
        requestDetails,
      });

    if (!insertResult.ok) {
      const errMsg =
        "error" in insertResult && insertResult.error
          ? insertResult.error
          : "unknown error";

      console.error(
        "[kaipoke_user_auto_add] insert error",
        userIdStr,
        errMsg,
      );

      result.errors.push({
        user_id: userIdStr,
        message: errMsg,
      });
      result.ok = false;
    } else {
      result.created += 1;
    }
  }

  console.info("[kaipoke_user_auto_add] done", {
    dryRun,
    scanned: result.scanned,
    created: result.created,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return result;
}

async function handler(req: NextRequest) {
  // ---- 認証 ----
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req);

  if (!serverSecret) {
    console.warn("[kaipoke_user_auto_add][auth] CRON_SECRET が未設定です");
    return NextResponse.json(
      { ok: false, reason: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const { token, src } = incoming;
  const mask = (s?: string | null) =>
    s ? `${s.slice(0, 2)}...(${s.length})` : "null";

  console.log("[cron][auth]", {
    path: req.nextUrl.pathname,
    src,
    hasServerSecret: !!serverSecret,
    serverSecretLen: serverSecret?.length ?? 0,
    tokenPreview: mask(token),
  });

  if (!token || token !== serverSecret) {
    console.warn("[kaipoke_user_auto_add][auth] unauthorized", {
      path: req.nextUrl.pathname,
      reason: !token ? "no_token" : "mismatch",
    });
    return NextResponse.json(
      { ok: false, reason: "Unauthorized" },
      { status: 401 },
    );
  }

  // ---- クエリパラメータ ----
  const url = req.nextUrl;

  const dryRunParam = url.searchParams.get("dry_run");
  const dryRun = dryRunParam === "true";

  const limitParam = url.searchParams.get("limit");
  const limit =
    limitParam && !Number.isNaN(Number(limitParam))
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 200)
      : 50;

  // ---- 本体処理 ----
  const result = await runJob({ dryRun, limit });
  const status = result.ok ? 200 : 500;

  return NextResponse.json(result, { status });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
