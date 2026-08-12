import { NextResponse } from "next/server";
import { getOnboardingDocument } from "@/lib/rpa/onboardingCandidates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid document id" }, { status: 400 });
  }

  try {
    const document = await getOnboardingDocument(id);
    if (!document) return NextResponse.json({ error: "document not found" }, { status: 404 });
    return NextResponse.json({ document });
  } catch (error) {
    console.error("[rpa/onboarding/documents] extraction failed", error);
    return NextResponse.json({ error: "candidate extraction failed" }, { status: 500 });
  }
}
