//api/faximo/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  FaximoApiError,
  sendFaximoFax,
  type FaximoAttachment,
} from "@/lib/faximo/client";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_DESTINATIONS_PER_REQUEST = 50;

type FaxTarget = {
  id?: string;
  fax: string;
  office_name?: string;
};

type ChunkResult = {
  chunkNo: number;
  recipientCount: number;
  faxNumbers: string[];
  ok: boolean;
  processKey: string;
  faximoResultCode?: string;
  faximoRequestId?: string;
  acceptedAt?: string;
  error?: string;
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


function getSendableFaxNumber(
  value: string,
): string | null {
  const source = value.trim();

  if (!source) {
    return null;
  }

  /*
   * 使用を許可する文字：
   * ・半角数字
   * ・半角ハイフン
   * ・半角/改行系の空白
   * ・半角丸括弧
   *
   * アルファベット、#、全角文字などが
   * 1文字でも含まれる場合は送信対象外にする。
   */
  if (!/^[0-9\s()-]+$/.test(source)) {
    return null;
  }

  const normalized = source.replace(
    /[\s()-]/g,
    "",
  );

  if (!/^\d{1,20}$/.test(normalized)) {
    return null;
  }

  return normalized;
}


function parseFaxNumbers(
  formData: FormData,
): string[] {
  const repeatedValues = formData
    .getAll("faxNumbers")
    .filter(
      (value): value is string =>
        typeof value === "string",
    );

  const rawValues =
    repeatedValues.length > 0
      ? repeatedValues
      : [
        readOptionalString(
          formData,
          "fax_numbers",
        ) ?? "",
      ];

  return rawValues
    .flatMap((value) =>
      value.split(/[\n,、;；]+/),
    )
    .map(getSendableFaxNumber)
    .filter(
      (
        faxNumber,
      ): faxNumber is string =>
        faxNumber !== null,
    );
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
            ? getSendableFaxNumber(row.fax)
            : null;

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

function createProcessKey(chunkNo: number): string {
  return `fx${Date.now().toString(36)}${chunkNo.toString(36)}${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 5)}`.slice(0, 20);
}

function chunkArray<T>(
  values: T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(
      values.slice(index, index + size),
    );
  }

  return chunks;
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
          error:
            "送信可能なFAX番号がありません。半角数字、半角ハイフン、空白、丸括弧以外を含む番号は送信対象外です。",
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

    const targetByFax = new Map(
      faxTargets.map((target) => [
        target.fax,
        target,
      ]),
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

    const userKey =
      readOptionalString(
        formData,
        "userKey",
      );

    const tsi =
      readOptionalString(
        formData,
        "tsi",
      );

    const headerInfo =
      readOptionalString(
        formData,
        "headerInfo",
      );

    const fileNames = files.map(
      (file) => file.name,
    );

    /*
     * faximoSilverへ送信する前に履歴を登録する。
     * 履歴登録に失敗した場合はFAXを送信しない。
     */
    const faxNumberChunks = chunkArray(
      faxNumbers,
      MAX_DESTINATIONS_PER_REQUEST,
    );

    const results: ChunkResult[] = [];

    for (
      let index = 0;
      index < faxNumberChunks.length;
      index += 1
    ) {
      const chunkNo = index + 1;
      const chunkFaxNumbers =
        faxNumberChunks[index];

      const processKey =
        createProcessKey(chunkNo);

      const chunkTargets =
        chunkFaxNumbers.map(
          (fax) =>
            targetByFax.get(fax) ?? { fax },
        );

      /*
       * この分割分のFAX履歴を先に登録する。
       */
      const { error: insertError } =
        await supabase
          .from("fax_log")
          .insert(
            chunkTargets.map((target) => ({
              batch_id: batchId,
              process_key: processKey,

              fax_number: target.fax,
              office_name:
                target.office_name ?? null,
              fax_master_id:
                target.id ?? null,

              subject: subject ?? null,
              file_names: fileNames,
              file_count: files.length,

              /*
               * このprocess_keyで送る件数。
               * 全体件数ではない。
               */
              recipient_count:
                chunkFaxNumbers.length,

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
        results.push({
          chunkNo,
          recipientCount:
            chunkFaxNumbers.length,
          faxNumbers: chunkFaxNumbers,
          ok: false,
          processKey,
          error:
            `FAX履歴の登録に失敗しました: ${insertError.message}`,
        });

        /*
         * この分割だけ失敗扱いにして、
         * 次の50件へ進む。
         */
        continue;
      }

      try {
        const result =
          await sendFaximoFax({
            faxNumbers:
              chunkFaxNumbers,

            attachments,
            body,
            subject,
            userKey,
            tsi,
            headerInfo,

            retryCount:
              retryCount as
              | 0
              | 1
              | 2
              | 3
              | undefined,

            resultEmail,
            processKey,
          });

        /*
         * このprocess_keyに属するログだけ更新する。
         */
        const { error: updateError } =
          await supabase
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
            .eq("batch_id", batchId)
            .eq(
              "process_key",
              processKey,
            );

        if (updateError) {
          console.error(
            "[api/faximo/send] fax_log accepted update failed",
            {
              batchId,
              processKey,
              updateError,
            },
          );
        }

        results.push({
          chunkNo,
          recipientCount:
            chunkFaxNumbers.length,
          faxNumbers:
            chunkFaxNumbers,
          ok: true,

          processKey:
            result.processkey ??
            processKey,

          faximoResultCode:
            result.result,

          faximoRequestId:
            result.idxcnt,

          acceptedAt:
            result.accepttime,
        });
      } catch (error) {
        const faximoResultCode =
          error instanceof FaximoApiError
            ? error.resultCode
            : undefined;

        const errorMessage =
          error instanceof Error
            ? error.message
            : "FAX送信処理に失敗しました";

        /*
         * この分割に属するログだけ失敗へ更新する。
         */
        const { error: updateError } =
          await supabase
            .from("fax_log")
            .update({
              status:
                "request_failed",

              status_message:
                errorMessage,

              faximo_result_code:
                faximoResultCode ??
                null,

              updated_at:
                new Date().toISOString(),
            })
            .eq("batch_id", batchId)
            .eq(
              "process_key",
              processKey,
            );

        if (updateError) {
          console.error(
            "[api/faximo/send] fax_log failure update failed",
            {
              batchId,
              processKey,
              updateError,
            },
          );
        }

        results.push({
          chunkNo,
          recipientCount:
            chunkFaxNumbers.length,
          faxNumbers:
            chunkFaxNumbers,
          ok: false,
          processKey,
          faximoResultCode,
          error:
            errorMessage,
        });
      }
    }

    const succeededChunks =
      results.filter(
        (result) => result.ok,
      );

    const failedChunks =
      results.filter(
        (result) => !result.ok,
      );

    const acceptedRecipientCount =
      succeededChunks.reduce(
        (sum, result) =>
          sum +
          result.recipientCount,
        0,
      );

    const failedRecipientCount =
      failedChunks.reduce(
        (sum, result) =>
          sum +
          result.recipientCount,
        0,
      );

    if (succeededChunks.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          partial: false,
          error:
            "すべてのFAX送信依頼に失敗しました",

          batchId,
          resultEmail,

          totalRecipientCount:
            faxNumbers.length,

          acceptedRecipientCount,
          failedRecipientCount,

          chunkCount:
            results.length,

          results,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok:
          failedChunks.length === 0,

        partial:
          failedChunks.length > 0,

        batchId,
        resultEmail,

        totalRecipientCount:
          faxNumbers.length,

        acceptedRecipientCount,
        failedRecipientCount,

        chunkCount:
          results.length,

        results,
      },
      {
        status:
          failedChunks.length > 0
            ? 207
            : 200,
      },
    );

  } catch (error) {
    console.error(
      "[api/faximo/send] failed",
      error,
    );

    if (error instanceof FaximoApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          faximoResultCode:
            error.resultCode,
          batchId,
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

        batchId,
      },
      { status: 400 },
    );
  }
}