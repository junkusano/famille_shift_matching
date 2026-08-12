import { NextResponse } from "next/server";
import { getBasicInfoDocuments } from "@/lib/rpa/onboardingCandidates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const documents = await getBasicInfoDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[rpa/onboarding/documents] list failed", error);
    return NextResponse.json({ error: "document list failed" }, { status: 500 });
  }
}
