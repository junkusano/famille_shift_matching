import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  FaximoApiError,
  sendFaximoFax,
  type FaximoAttachment,
} from "@/lib/faximo/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type FaxTarget = {
  id?: string;
  fax: string;
  office_name?: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function readOptionalString(
  formData: FormData,
  key: string,
): string | undefined {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed || undefined;
}

function parseFaxNumbers(formData: FormData): string[] {
  const repeatedValues = formData
    .getAll("faxNumbers")
    .filter((value): value is string => typeof value === "string");

  const rawValues =
    repeatedValues.length > 0
      ? repeatedValues
      : [readOptionalString(formData, "fax_numbers") ?? ""];

  return rawValues
    .flatMap((value) => value.split(/[\n,、;；]+/))
    .map((value) => value.replace(/[\s()-]/g, ""))
    .filter(Boolean);
}

function parseFaxTargets(
  formData: FormData,
  faxNumbers: string[],
): FaxTarget[] {
  const raw = readOptionalString(formData, "faxTargets");

  if (!raw) {
    return faxNumbers.map((fax) => ({ fax }));
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("配列ではありません");
    }

    const targets = parsed
      .map<FaxTarget | null>((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const row = item as Record<string, unknown>;

        const fax =
          typeof row.fax === "string"
            ? row.fax.replace(/[\s()-]/g, "")
            : "";

        if (!fax) {
          return null;
        }

        const target: FaxTarget = {
          fax,
        };

        if (typeof row.id === "string" && row.id.trim()) {
          target.id = row.id.trim();
        }

        if (
          typeof row.office_name === "string" &&
          row.office_name.trim()
        ) {
          target.office_name = row.office_name.trim();
        }

        return target;
      })
      .filter((item): item is FaxTarget => item !== null);

    const byFax = new Map(
      targets.map((target) => [target.fax, target]),
    );

    return faxNumbers.map(
      (fax) => byFax.get(fax) ?? { fax },
    );
  } catch {
    throw new Error("faxTargetsのJSON形式が不正です");
  }
}

function createProcessKey(): string {
  return `fx${Date.now().toString(36)}${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 6)}`.slice(0, 20);
}

function getFaximoResultEmail(): string {
  const resultEmail =
    process.env.FAXIMO_RESULT_EMAIL?.trim();

  if (!resultEmail) {
    throw new Error(
      "FAXIMO_RESULT_EMAIL が設定されていません",
    );
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(resultEmail)) {
    throw new Error(
      "FAXIMO_RESULT_EMAIL のメールアドレス形式が不正です",
    );
  }

  return resultEmail;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const batchId = crypto.randomUUID();
  const processKey = createProcessKey();

  let logCreated = false;

  try {
    const contentType =
      request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          ok: false,
          error: "multipart/form-dataで送信してください",
        },
        { status: 415 },
      );
    }

    /*
     * faximoSilverからの結果通知先。
     * ブラウザからは受け取らず、サーバー環境変数で固定する。
     */
    const resultEmail = getFaximoResultEmail();

    const formData = await request.formData();

    const faxNumbers = parseFaxNumbers(formData);

    if (faxNumbers.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "FAX番号が指定されていません",
        },
        { status: 400 },
      );
    }

    if (faxNumbers.length > 50) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "FAX送信先は1回につき最大50件です",
        },
        { status: 400 },
      );
    }

    const duplicateFaxNumbers = faxNumbers.filter(
      (faxNumber, index, array) =>
        array.indexOf(faxNumber) !== index,
    );

    if (duplicateFaxNumbers.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "同じFAX番号が複数指定されています",
        },
        { status: 400 },
      );
    }

    const faxTargets = parseFaxTargets(
      formData,
      faxNumbers,
    );

    const files = formData
      .getAll("files")
      .filter(
        (value): value is File =>
          value instanceof File && value.size > 0,
      );

    const body = readOptionalString(formData, "body");

    if (files.length === 0 && !body) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "送信するファイルまたは本文を指定してください",
        },
        { status: 400 },
      );
    }

    const attachments: FaximoAttachment[] =
      await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          data: Buffer.from(
            await file.arrayBuffer(),
          ),
        })),
      );

    const retryRaw = readOptionalString(
      formData,
      "retryCount",
    );

    const retryCount =
      retryRaw === undefined
        ? undefined
        : Number(retryRaw);

    if (
      retryCount !== undefined &&
      ![0, 1, 2, 3].includes(retryCount)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "retryCountは0〜3で指定してください",
        },
        { status: 400 },
      );
    }

    const subject =
      readOptionalString(formData, "subject");

    const requesterUserId =
      readOptionalString(
        formData,
        "requesterUserId",
      );

    const requesterUserName =
      readOptionalString(
        formData,
        "requesterUserName",
      );

    const fileNames = files.map(
      (file) => file.name,
    );

    /*
     * faximoSilverへ送信する前に履歴を登録する。
     * 履歴登録に失敗した場合はFAXを送信しない。
     */
    const { error: insertError } = await supabase
      .from("fax_log")
      .insert(
        faxTargets.map((target) => ({
          batch_id: batchId,
          process_key: processKey,

          fax_number: target.fax,
          office_name:
            target.office_name ?? null,
          fax_master_id: target.id ?? null,

          subject: subject ?? null,
          file_names: fileNames,
          file_count: files.length,
          recipient_count: faxNumbers.length,

          status: "requesting",
          status_message:
            "faximoSilverへ送信依頼中",

          requester_user_id:
            requesterUserId ?? null,
          requester_user_name:
            requesterUserName ?? null,

          page_name:
            "/portal/fax-sending",

          mail_to: resultEmail,

          retry_count:
            retryCount ?? 3,
        })),
      );

    if (insertError) {
      throw new Error(
        `FAX履歴の登録に失敗しました: ${insertError.message}`,
      );
    }

    logCreated = true;

    /*
     * faximoSilver REST APIへ送信
     */
    const result = await sendFaximoFax({
      faxNumbers,
      attachments,
      body,
      subject,

      userKey: readOptionalString(
        formData,
        "userKey",
      ),

      tsi: readOptionalString(
        formData,
        "tsi",
      ),

      headerInfo: readOptionalString(
        formData,
        "headerInfo",
      ),

      retryCount:
        retryCount as
          | 0
          | 1
          | 2
          | 3
          | undefined,

      /*
       * faximoSilverのresaddressへ設定される。
       * 結果通知メールはこの固定アドレスへ届く。
       */
      resultEmail,

      processKey,
    });

    /*
     * faximoSilverが受付に成功したら
     * fax_logをacceptedへ更新する。
     */
    const { error: updateError } = await supabase
      .from("fax_log")
      .update({
        status: "accepted",
        status_message:
          "faximoSilverが送信依頼を受け付けました",

        faximo_result_code:
          result.result,

        faximo_request_id:
          result.idxcnt ?? null,

        accepted_at:
          result.accepttime ?? null,

        mail_to: resultEmail,

        updated_at:
          new Date().toISOString(),
      })
      .eq("batch_id", batchId);

    if (updateError) {
      console.error(
        "[api/faximo/send] fax_log accepted update failed",
        updateError,
      );
    }

    return NextResponse.json({
      ok: true,
      result: result.result,

      processKey:
        result.processkey ?? processKey,

      acceptedAt:
        result.accepttime,

      faximoRequestId:
        result.idxcnt,

      batchId,

      resultEmail,
    });
  } catch (error) {
    console.error(
      "[api/faximo/send] failed",
      error,
    );

    if (logCreated) {
      const faximoResultCode =
        error instanceof FaximoApiError
          ? error.resultCode
          : undefined;

      const { error: updateError } =
        await supabase
          .from("fax_log")
          .update({
            status: "request_failed",

            status_message:
              error instanceof Error
                ? error.message
                : "FAX送信処理に失敗しました",

            faximo_result_code:
              faximoResultCode ?? null,

            updated_at:
              new Date().toISOString(),
          })
          .eq("batch_id", batchId);

      if (updateError) {
        console.error(
          "[api/faximo/send] fax_log failure update failed",
          updateError,
        );
      }
    }

    if (error instanceof FaximoApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          faximoResultCode:
            error.resultCode,
          batchId:
            logCreated
              ? batchId
              : undefined,
        },
        {
          status:
            error.httpStatus &&
            error.httpStatus >= 400
              ? 502
              : 400,
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "FAX送信処理に失敗しました",

        batchId:
          logCreated
            ? batchId
            : undefined,
      },
      { status: 400 },
    );
  }
}