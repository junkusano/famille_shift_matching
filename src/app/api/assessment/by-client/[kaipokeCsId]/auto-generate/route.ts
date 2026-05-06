//api/assessment/by-client/[kaipokeCsId]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type DbError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

type DbResult<T> = {
  data: T | null;
  error: DbError | null;
};

type DbValue = string | number | boolean | null | DbValue[] | { [key: string]: DbValue };
type DbRecord = Record<string, DbValue>;

type DbQuery = PromiseLike<DbResult<unknown[]>> & {
  select(columns?: string): DbQuery;
  eq(column: string, value: string | number | boolean | null): DbQuery;
  insert(values: DbRecord | DbRecord[]): DbQuery;
  maybeSingle(): Promise<DbResult<unknown>>;
  single(): Promise<DbResult<unknown>>;
};

type DbClientLoose = {
  from(table: string): DbQuery;
};

const db = supabaseAdmin as unknown as DbClientLoose;

type SourceRow = {
  plan_document_kind?: string | null;
  plan_service_category?: string | null;
  plan_display_name?: string | null;
  kaipoke_servicek?: string | null;
  kaipoke_servicecode?: string | null;
  service_code?: string | null;
};

type Client = {
  id: string;
  kaipoke_cs_id: string;
  name?: string | null;
};

type AssessmentKind = "障害" | "移動支援" | "要介護" | "要支援";

type CreatedAssessment = {
  id?: string;
  service_kind: AssessmentKind;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toSourceRows(value: unknown): SourceRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row): SourceRow => {
    const r = asRecord(row) ?? {};
    return {
      plan_document_kind: toStringValue(r.plan_document_kind),
      plan_service_category: toStringValue(r.plan_service_category),
      plan_display_name: toStringValue(r.plan_display_name),
      kaipoke_servicek: toStringValue(r.kaipoke_servicek),
      kaipoke_servicecode: toStringValue(r.kaipoke_servicecode),
      service_code: toStringValue(r.service_code),
    };
  });
}

function toClient(value: unknown): Client | null {
  const r = asRecord(value);
  if (!r) return null;

  const id = toStringValue(r.id);
  const kaipokeCsId = toStringValue(r.kaipoke_cs_id);

  if (!id || !kaipokeCsId) return null;

  return {
    id,
    kaipoke_cs_id: kaipokeCsId,
    name: toStringValue(r.name),
  };
}

function toCreatedAssessment(value: unknown, serviceKind: AssessmentKind): CreatedAssessment {
  const r = asRecord(value);
  return {
    id: r ? toStringValue(r.id) ?? undefined : undefined,
    service_kind: serviceKind,
  };
}

function detectAssessmentKinds(rows: SourceRow[]): AssessmentKind[] {
  const kinds = new Set<AssessmentKind>();

  for (const row of rows) {
    const text = [
      row.plan_document_kind,
      row.plan_service_category,
      row.plan_display_name,
      row.kaipoke_servicek,
      row.kaipoke_servicecode,
      row.service_code,
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");

    if (
      row.plan_document_kind === "障害福祉サービス" ||
      /居宅介護|重度訪問|同行援護|行動援護|障害福祉/.test(text)
    ) {
      kinds.add("障害");
    }

    if (
      row.plan_document_kind === "移動支援サービス" ||
      /移動支援|重度就労|自費/.test(text)
    ) {
      kinds.add("移動支援");
    }

    if (/要介護|介護保険|訪問介護|身体介護|生活援助|通院等乗降介助/.test(text)) {
      kinds.add("要介護");
    }

    if (/要支援|介護予防|総合事業|予防専門型|生活支援型/.test(text)) {
      kinds.add("要支援");
    }
  }

  return [...kinds];
}

async function fetchClient(clientKey: string): Promise<Client | null> {
  if (/^\d+$/.test(clientKey)) {
    const { data, error } = await db
      .from("cs_kaipoke_info")
      .select("*")
      .eq("kaipoke_cs_id", clientKey)
      .maybeSingle();

    if (error) {
      console.error("[assessment] client lookup error by kaipoke_cs_id", error);
      return null;
    }

    return toClient(data);
  }

  const { data, error } = await db
    .from("cs_kaipoke_info")
    .select("*")
    .eq("id", clientKey)
    .maybeSingle();

  if (error) {
    console.error("[assessment] client lookup error by id", error);
    return null;
  }

  return toClient(data);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ kaipokeCsId: string }> }
) {
  try {
    const { kaipokeCsId } = await context.params;
    const clientKey = kaipokeCsId;
    const body = (await req.json().catch(() => ({}))) as {
      overwrite?: boolean;
      service_kind?: AssessmentKind;
    };

    const overwrite = body.overwrite === true;
    const requestedKind = body.service_kind;

    console.info("[assessment] by-client auto-generate start", {
      clientKey,
      overwrite,
      requestedKind,
    });

    const client = await fetchClient(clientKey);

    if (!client) {
      return NextResponse.json(
        { ok: false, error: "client not found", clientKey },
        { status: 404 }
      );
    }

    const { data: sourceData, error: sourceError } = await db
      .from("plan_generation_source_view")
      .select("*")
      .eq("kaipoke_cs_id", client.kaipoke_cs_id);

    if (sourceError) {
      console.error("[assessment] source lookup error", sourceError);
    }

    const sourceRows = toSourceRows(sourceData);
    const detectedKinds = requestedKind ? [requestedKind] : detectAssessmentKinds(sourceRows);

    console.info("[assessment] detected kinds", {
      clientId: client.id,
      kaipokeCsId: client.kaipoke_cs_id,
      sourceRows: sourceRows.length,
      detectedKinds,
    });

    if (detectedKinds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "生成対象のアセスメントはありませんでした。",
        detectedKinds: [],
        created: [],
        updated: [],
        skipped: [],
      });
    }

    const created: CreatedAssessment[] = [];
    const updated: CreatedAssessment[] = [];
    const skipped: AssessmentKind[] = [];

    for (const kind of detectedKinds) {
      const { data: existingData, error: existingError } = await db
        .from("assessments_records")
        .select("id")
        .eq("client_info_id", client.id)
        .eq("service_kind", kind)
        .maybeSingle();

      if (existingError) {
        console.error("[assessment] existing lookup error", {
          kind,
          error: existingError,
        });
        continue;
      }

      const existing = asRecord(existingData);

      if (existing && !overwrite) {
        skipped.push(kind);
        continue;
      }

      if (existing && overwrite) {
        updated.push({
          id: toStringValue(existing.id) ?? undefined,
          service_kind: kind,
        });
        continue;
      }

      const insertPayload: DbRecord = {
        client_info_id: client.id,
        kaipoke_cs_id: client.kaipoke_cs_id,
        service_kind: kind,
        title: `${kind}アセスメント`,
        status: "draft",
      };

      const { data: insertedData, error: insertError } = await db
        .from("assessments_records")
        .insert(insertPayload)
        .select("id, service_kind")
        .single();

      if (insertError) {
        console.error("[assessment] insert error", {
          kind,
          error: insertError,
        });
        continue;
      }

      created.push(toCreatedAssessment(insertedData, kind));
    }

    return NextResponse.json({
      ok: true,
      detectedKinds,
      created,
      updated,
      skipped,
      overwrite,
    });
  } catch (error) {
    console.error("[assessment] by-client auto-generate fatal", error);

    return NextResponse.json(
      {
        ok: false,
        error: "internal error",
      },
      { status: 500 }
    );
  }
}