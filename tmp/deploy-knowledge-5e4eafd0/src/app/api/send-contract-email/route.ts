import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { generateContractsAfterInterviewHtml } from "@/lib/emailTemplates/contractsAfterInterview";
import { EntryDetail } from "@/types/entryDetail";  // またはファイル内で型宣言してもOK

export async function POST(req: Request) {
  const { entry }: { entry: EntryDetail } = await req.json();

  const html = generateContractsAfterInterviewHtml(entry);

  const response = await sendEmail({
    to: entry.email,
    subject: "雇用契約書のご案内",
    html
  });

  if (response.status === "ok") {
    return NextResponse.json({ status: "ok", messageId: response.messageId });
  } else {
    return NextResponse.json({ status: "error", error: response.error }, { status: 500 });
  }
}
