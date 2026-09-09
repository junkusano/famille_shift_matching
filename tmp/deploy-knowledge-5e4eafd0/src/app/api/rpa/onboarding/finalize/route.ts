import { NextRequest, NextResponse } from "next/server";
import { ensureInformationLinkGroup } from "@/lib/lineworks/informationLinkGroup";
import { supabaseAdmin } from "@/lib/supabase/service";

const KAIPOKE_ID_PATTERN = /^\d{1,20}$/;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function linkDocument(
  docId: string | null,
  expectedName: string | null,
  client: { id: string; kaipoke_cs_id: string },
) {
  if (!docId) return { status: "skipped" as const };
  if (!expectedName) return { status: "error" as const, error: "expected client name is missing" };
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return { status: "error" as const, error: "invalid document id" };

  const { data: doc, error } = await supabaseAdmin
    .from("cs_docs")
    .select("id,kaipoke_cs_id,cs_kaipoke_info_id")
    .eq("id", docId)
    .maybeSingle();
  if (error) return { status: "error" as const, error: "document lookup failed" };
  if (!doc) return { status: "error" as const, error: "document not found" };

  const linkedToOther =
    (doc.kaipoke_cs_id && doc.kaipoke_cs_id !== client.kaipoke_cs_id)
    || (doc.cs_kaipoke_info_id && doc.cs_kaipoke_info_id !== client.id);
  if (linkedToOther) return { status: "conflict" as const, error: "document is linked to another client" };

  if (doc.kaipoke_cs_id === client.kaipoke_cs_id && doc.cs_kaipoke_info_id === client.id) {
    return { status: "already_linked" as const };
  }

  const { error: updateError } = await supabaseAdmin
    .from("cs_docs")
    .update({ kaipoke_cs_id: client.kaipoke_cs_id, cs_kaipoke_info_id: client.id })
    .eq("id", doc.id);
  return updateError
    ? { status: "error" as const, error: "document link failed" }
    : { status: "linked" as const };
}

export async function POST(request: NextRequest) {
  let body: { kaipoke_cs_id?: unknown; cs_doc_id?: unknown; expected_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const kaipokeCsId = typeof body.kaipoke_cs_id === "string" ? body.kaipoke_cs_id.trim() : "";
  const docId = typeof body.cs_doc_id === "string" ? body.cs_doc_id.trim() || null : null;
  const expectedName = typeof body.expected_name === "string"
    ? body.expected_name.replace(/[\s\u3000]+/g, "").trim() || null
    : null;
  if (!KAIPOKE_ID_PATTERN.test(kaipokeCsId)) {
    return NextResponse.json({ error: "invalid kaipoke_cs_id" }, { status: 400 });
  }

  const { data: client, error } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id,kaipoke_cs_id,name")
    .eq("kaipoke_cs_id", kaipokeCsId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "client lookup failed" }, { status: 500 });
  if (!client) {
    return NextResponse.json({
      myfamille: { status: "not_found" },
      document: { status: "skipped" },
      lineworks_group: { status: "skipped" },
      members: { added: 0, already_exists: 0, failed: [] },
      group_masters: { added: 0, already_exists: 0, failed: [] },
    });
  }

  const normalizedClientName = client.name.replace(/[\s\u3000]+/g, "").trim();
  const document = docId && expectedName !== normalizedClientName
    ? { status: "conflict" as const, error: "document candidate name does not match client name" }
    : await linkDocument(docId, expectedName, client);

  if (docId && document.status !== "linked" && document.status !== "already_linked") {
    return NextResponse.json({
      myfamille: { status: "success", client_id: client.id },
      document,
      lineworks_group: { status: "skipped" },
      members: { added: 0, already_exists: 0, failed: [] },
      group_masters: { added: 0, already_exists: 0, failed: [] },
    });
  }
  const lineworks = await ensureInformationLinkGroup(client.kaipoke_cs_id, client.name);

  return NextResponse.json({
    myfamille: { status: "success", client_id: client.id },
    document,
    ...lineworks,
  });
}
