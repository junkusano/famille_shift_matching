// src/app/api/assessment/by-client/[kaipokeCsId]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import {
  buildAssessmentContentForKind,
  detectAssessmentKindsFromWeeklyRows,
  type AutoAssessmentKind,
  type ClientAssessmentSource,
  type WeeklyAssessmentSourceRow,
} from "@/lib/assessment/assessment-kind-detector";

export const dynamic = "force-dynamic";

type RequestBody = {
  overwrite?: boolean;

  /**
   * 旧画面との互換性のため受け取りますが、
   * アセスメント種別の判定には使用しません。
   *
   * 種別は週間シフトからのみ判定します。
   */
  service_kind?: AutoAssessmentKind;
};

type AuthorInfo = {
  userId: string;
  name: string;
};

type AssessmentResultRow = {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_kind: AutoAssessmentKind;
  assessed_on: string;
  author_user_id: string;
  author_name: string;
  content: unknown;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toWeeklyRows(value: unknown): WeeklyAssessmentSourceRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item): WeeklyAssessmentSourceRow => {
    const row = asRecord(item) ?? {};

    return {
      template_id:
        toNumberOrNull(row.template_id) ??
        toStringOrNull(row.template_id),

      kaipoke_cs_id: toStringOrNull(row.kaipoke_cs_id),

      weekday: toNumberOrNull(row.weekday),
      weekday_jp: toStringOrNull(row.weekday_jp),

      start_time: toStringOrNull(row.start_time),
      end_time: toStringOrNull(row.end_time),

      duration_minutes: toNumberOrNull(row.duration_minutes),

      service_code: toStringOrNull(row.service_code),
      kaipoke_servicek: toStringOrNull(row.kaipoke_servicek),
      kaipoke_servicecode: toStringOrNull(
        row.kaipoke_servicecode,
      ),

      plan_document_kind: toStringOrNull(
        row.plan_document_kind,
      ),

      plan_service_category: toStringOrNull(
        row.plan_service_category,
      ),

      plan_display_name: toStringOrNull(
        row.plan_display_name,
      ),

      shift_start_date: toStringOrNull(
        row.shift_start_date,
      ),

      status: toStringOrNull(row.status),
    };
  });
}

function toClientAssessmentSource(
  value: unknown,
): ClientAssessmentSource | null {
  const row = asRecord(value);

  if (!row) return null;

  const id = toStringOrNull(row.id);
  const kaipokeCsId = toStringOrNull(row.kaipoke_cs_id);

  if (!id || !kaipokeCsId) {
    return null;
  }

  return {
    id,
    kaipoke_cs_id: kaipokeCsId,

    name: toStringOrNull(row.name),
    kana: toStringOrNull(row.kana),
    gender: toStringOrNull(row.gender),
    address: toStringOrNull(row.address),

    phone_01: toStringOrNull(row.phone_01),
    phone_02: toStringOrNull(row.phone_02),

    birth_yyyy_mm_dd: toStringOrNull(
      row.birth_yyyy_mm_dd,
    ),

    service_kind: toStringOrNull(row.service_kind),

    kaigo_hoken_no: toStringOrNull(row.kaigo_hoken_no),
    kaigo_start_at: toStringOrNull(row.kaigo_start_at),
    kaigo_end_at: toStringOrNull(row.kaigo_end_at),

    shogai_jukyusha_no: toStringOrNull(
      row.shogai_jukyusha_no,
    ),

    shogai_start_at: toStringOrNull(
      row.shogai_start_at,
    ),

    shogai_end_at: toStringOrNull(row.shogai_end_at),

    ido_start_at: toStringOrNull(row.ido_start_at),
    ido_end_at: toStringOrNull(row.ido_end_at),

    documents: row.documents,
  };
}

async function readAuthenticatedUser(
  req: NextRequest,
): Promise<{
  authUid: string;
  email: string | null;
} | null> {
  try {
    const { user } = await getUserFromBearer(req);

    if (!user?.id) {
      return null;
    }

    return {
      authUid: user.id,
      email: user.email ?? null,
    };
  } catch (error) {
    console.error(
      "[assessment][by-client] authentication failed",
      error,
    );

    return null;
  }
}

async function resolveAuthor(
  authUid: string,
  email: string | null,
): Promise<AuthorInfo> {
  const { data: appUser, error: appUserError } =
    await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("auth_user_id", authUid)
      .maybeSingle();

  if (appUserError) {
    console.error(
      "[assessment][by-client] users lookup failed",
      appUserError,
    );
  }

  const userId =
    toStringOrNull(appUser?.user_id) ??
    authUid;

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("user_entry_united_view_single")
      .select(
        "user_id, last_name_kanji, first_name_kanji, email",
      )
      .eq("user_id", userId)
      .maybeSingle();

  if (profileError) {
    console.error(
      "[assessment][by-client] profile lookup failed",
      profileError,
    );
  }

  const fullName = [
    toStringOrNull(profile?.last_name_kanji),
    toStringOrNull(profile?.first_name_kanji),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  const name =
    fullName ||
    toStringOrNull(profile?.email) ||
    email ||
    userId;

  return {
    userId,
    name,
  };
}

async function fetchClient(
  clientKey: string,
): Promise<ClientAssessmentSource | null> {
  const normalizedKey = clientKey.trim();

  if (!normalizedKey) return null;

  const selectColumns = [
    "id",
    "kaipoke_cs_id",
    "name",
    "kana",
    "gender",
    "address",
    "phone_01",
    "phone_02",
    "birth_yyyy_mm_dd",
    "service_kind",
    "kaigo_hoken_no",
    "kaigo_start_at",
    "kaigo_end_at",
    "shogai_jukyusha_no",
    "shogai_start_at",
    "shogai_end_at",
    "ido_start_at",
    "ido_end_at",
    "documents",
  ].join(", ");

  if (/^\d+$/.test(normalizedKey)) {
    const { data, error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select(selectColumns)
      .eq("kaipoke_cs_id", normalizedKey)
      .maybeSingle();

    if (error) {
      console.error(
        "[assessment][by-client] client lookup by kaipoke_cs_id failed",
        error,
      );

      throw new Error(
        `利用者情報の取得に失敗しました: ${error.message}`,
      );
    }

    return toClientAssessmentSource(data);
  }

  const { data, error } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select(selectColumns)
    .eq("id", normalizedKey)
    .maybeSingle();

  if (error) {
    console.error(
      "[assessment][by-client] client lookup by id failed",
      error,
    );

    throw new Error(
      `利用者情報の取得に失敗しました: ${error.message}`,
    );
  }

  return toClientAssessmentSource(data);
}

async function fetchWeeklyRows(
  kaipokeCsId: string,
): Promise<WeeklyAssessmentSourceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("plan_generation_source_view")
    .select("*")
    .eq("kaipoke_cs_id", kaipokeCsId);

  if (error) {
    console.error(
      "[assessment][by-client] weekly source lookup failed",
      error,
    );

    throw new Error(
      `週間シフト情報の取得に失敗しました: ${error.message}`,
    );
  }

  return toWeeklyRows(data);
}

async function findExistingAssessment(
  clientInfoId: string,
  kind: AutoAssessmentKind,
): Promise<AssessmentResultRow | null> {
  const { data, error } = await supabaseAdmin
    .from("assessments_records")
    .select(
      [
        "assessment_id",
        "client_info_id",
        "kaipoke_cs_id",
        "service_kind",
        "assessed_on",
        "author_user_id",
        "author_name",
        "content",
        "is_deleted",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("client_info_id", clientInfoId)
    .eq("service_kind", kind)
    .eq("is_deleted", false)
    .order("assessed_on", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[assessment][by-client] existing assessment lookup failed",
      {
        clientInfoId,
        kind,
        error,
      },
    );

    throw new Error(
      `${kind}アセスメントの既存確認に失敗しました: ${error.message}`,
    );
  }

  return (data as unknown as AssessmentResultRow | null) ?? null;
}

async function createAssessment(params: {
  client: ClientAssessmentSource;
  kind: AutoAssessmentKind;
  weeklyRows: WeeklyAssessmentSourceRow[];
  author: AuthorInfo;
}): Promise<AssessmentResultRow> {
  const { client, kind, weeklyRows, author } = params;

  const sourceText =
    extractAssessmentSourceText(
      client.documents,
    );

  const content = buildAssessmentContentForKind({
    kind,
    client,
    weeklyRows,
    sourceText,
  });
  const { data, error } = await supabaseAdmin
    .from("assessments_records")
    .insert({
      client_info_id: client.id,
      kaipoke_cs_id: client.kaipoke_cs_id,
      service_kind: kind,
      author_user_id: author.userId,
      author_name: author.name,
      content,
      is_deleted: false,
    })
    .select(
      [
        "assessment_id",
        "client_info_id",
        "kaipoke_cs_id",
        "service_kind",
        "assessed_on",
        "author_user_id",
        "author_name",
        "content",
        "is_deleted",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .single();

  if (error) {
    console.error(
      "[assessment][by-client] assessment insert failed",
      {
        clientInfoId: client.id,
        kaipokeCsId: client.kaipoke_cs_id,
        kind,
        error,
      },
    );

    throw new Error(
      `${kind}アセスメントの作成に失敗しました: ${error.message}`,
    );
  }

  return data as unknown as AssessmentResultRow;
}

async function overwriteAssessment(params: {
  assessmentId: string;
  client: ClientAssessmentSource;
  kind: AutoAssessmentKind;
  weeklyRows: WeeklyAssessmentSourceRow[];
  author: AuthorInfo;
}): Promise<AssessmentResultRow> {
  const {
    assessmentId,
    client,
    kind,
    weeklyRows,
    author,
  } = params;

  const sourceText =
    extractAssessmentSourceText(
      client.documents,
    );

  const content = buildAssessmentContentForKind({
    kind,
    client,
    weeklyRows,
    sourceText,
  });

  const { data, error } = await supabaseAdmin
    .from("assessments_records")
    .update({
      kaipoke_cs_id: client.kaipoke_cs_id,
      service_kind: kind,
      author_user_id: author.userId,
      author_name: author.name,
      content,
      is_deleted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("assessment_id", assessmentId)
    .eq("is_deleted", false)
    .select(
      [
        "assessment_id",
        "client_info_id",
        "kaipoke_cs_id",
        "service_kind",
        "assessed_on",
        "author_user_id",
        "author_name",
        "content",
        "is_deleted",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .single();

  if (error) {
    console.error(
      "[assessment][by-client] assessment overwrite failed",
      {
        assessmentId,
        kind,
        error,
      },
    );

    throw new Error(
      `${kind}アセスメントの更新に失敗しました: ${error.message}`,
    );
  }

  return data as unknown as AssessmentResultRow;
}

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{
      kaipokeCsId: string;
    }>;
  },
) {
  try {
    const authenticatedUser =
      await readAuthenticatedUser(req);

    if (!authenticatedUser) {
      return json(
        {
          ok: false,
          error: "認証情報を確認できませんでした。",
        },
        401,
      );
    }

    const { kaipokeCsId } = await context.params;

    const clientKey = decodeURIComponent(
      kaipokeCsId,
    ).trim();

    if (!clientKey) {
      return json(
        {
          ok: false,
          error: "利用者IDが指定されていません。",
        },
        400,
      );
    }

    const body = (await req
      .json()
      .catch(() => ({}))) as RequestBody;

    const overwrite = body.overwrite === true;

    /*
     * body.service_kind は旧画面との互換性のため受け取ります。
     * 今回の仕様では、アセスメント種別の判定には使用しません。
     */
    const ignoredRequestedKind =
      body.service_kind ?? null;

    console.info(
      "[assessment][by-client] auto-generate start",
      {
        clientKey,
        overwrite,
        ignoredRequestedKind,
      },
    );

    const [client, author] = await Promise.all([
      fetchClient(clientKey),
      resolveAuthor(
        authenticatedUser.authUid,
        authenticatedUser.email,
      ),
    ]);

    if (!client) {
      return json(
        {
          ok: false,
          error: "対象利用者が見つかりませんでした。",
          client_key: clientKey,
        },
        404,
      );
    }

    const weeklyRows = await fetchWeeklyRows(
      client.kaipoke_cs_id,
    );

    /*
     * 種別は週間シフトだけから判定します。
     *
     * 利用者情報のservice_kindや、画面から送られたservice_kindは
     * 判定には使用しません。
     */
    const detectedKinds =
      detectAssessmentKindsFromWeeklyRows(
        weeklyRows,
      );

    const targetKinds = [...detectedKinds];

    console.info(
      "[assessment][by-client] assessment kinds detected",
      {
        clientInfoId: client.id,
        kaipokeCsId: client.kaipoke_cs_id,
        weeklyRowCount: weeklyRows.length,
        detectedKinds,
        targetKinds,
      },
    );

    if (targetKinds.length === 0) {
      return json({
        ok: true,
        message:
          "週間シフトから生成対象のサービスを判定できませんでした。",
        detected_kinds: [],
        target_kinds: [],
        created: [],
        updated: [],
        skipped: [],
        overwrite,
      });
    }

    const created: AssessmentResultRow[] = [];
    const updated: AssessmentResultRow[] = [];
    const skipped: AssessmentResultRow[] = [];

    for (const kind of targetKinds) {
      const existing =
        await findExistingAssessment(
          client.id,
          kind,
        );

      if (existing && !overwrite) {
        skipped.push(existing);

        console.info(
          "[assessment][by-client] assessment skipped",
          {
            assessmentId:
              existing.assessment_id,
            kind,
            reason: "already_exists",
          },
        );

        continue;
      }

      if (existing && overwrite) {
        const updatedRecord =
          await overwriteAssessment({
            assessmentId:
              existing.assessment_id,
            client,
            kind,
            weeklyRows,
            author,
          });

        updated.push(updatedRecord);

        console.info(
          "[assessment][by-client] assessment updated",
          {
            assessmentId:
              updatedRecord.assessment_id,
            kind,
          },
        );

        continue;
      }

      const createdRecord =
        await createAssessment({
          client,
          kind,
          weeklyRows,
          author,
        });

      created.push(createdRecord);

      console.info(
        "[assessment][by-client] assessment created",
        {
          assessmentId:
            createdRecord.assessment_id,
          kind,
        },
      );
    }

    return json({
      ok: true,
      message: "アセスメント生成処理が完了しました。",
      client_info_id: client.id,
      kaipoke_cs_id: client.kaipoke_cs_id,
      detected_kinds: detectedKinds,
      target_kinds: targetKinds,
      created,
      updated,
      skipped,
      overwrite,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "アセスメント生成中に不明なエラーが発生しました。";

    console.error(
      "[assessment][by-client] auto-generate fatal",
      error,
    );

    return json(
      {
        ok: false,
        error: message,
      },
      500,
    );
  }
}

function extractAssessmentSourceText(
  documents: unknown,
): string {
  if (!documents) {
    return "";
  }

  if (typeof documents === "string") {
    return documents.trim();
  }

  if (Array.isArray(documents)) {
    return documents
      .map((document) =>
        extractAssessmentSourceText(document),
      )
      .filter(Boolean)
      .join("\n\n");
  }

  const record = asRecord(documents);

  if (!record) {
    return "";
  }

  const textCandidates = [
    record.text,
    record.content,
    record.summary,
    record.document_summary,
    record.shift_detail_information,
    record.extracted_text,
    record.ocr_text,
    record.body,
    record.description,
  ];

  const directText = textCandidates
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : "",
    )
    .filter(Boolean)
    .join("\n\n");

  if (directText) {
    return directText;
  }

  return Object.values(record)
    .map((value) =>
      extractAssessmentSourceText(value),
    )
    .filter(Boolean)
    .join("\n\n");
}