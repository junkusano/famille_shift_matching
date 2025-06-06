import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream"; // ← 追加！

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const filename = formData.get("filename") as string;

    if (!file || !filename) {
      return NextResponse.json({ error: "Missing file or filename" }, { status: 400 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    const buffer = Buffer.from(await file.arrayBuffer());

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: ["1N1EIT1escqpNREOfwc70YgBC8JVu78j2"],
      },
      media: {
        mimeType: file.type,
        body: bufferToStream(buffer), // ← ここが重要
      },
      fields: "id, webViewLink",
    });

    await drive.permissions.create({
      fileId: res.data.id!,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    return NextResponse.json({
      url: res.data.webViewLink,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
