import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";

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
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    const buffer = Buffer.from(await file.arrayBuffer());

    // 共有ドライブにアップロード
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: ["1N1EIT1escqpNREOfwc70YgBC8JVu78j2"], // ←共有ドライブのフォルダID
        driveId: "1N1EIT1escqpNREOfwc70YgBC8JVu78j2",   // ←共有ドライブID
      },
      media: {
        mimeType: file.type,
        body: bufferToStream(buffer),
      },
      supportsAllDrives: true,
      fields: "id",
    });

    const fileId = res.data.id!;

    // 外部公開パーミッション付与
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
        allowFileDiscovery: false, // 「リンクを知っている全員のみ」
      },
      supportsAllDrives: true,
    });

    // imgタグやImageコンポーネントで直接使える形式を返す
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    return NextResponse.json({
      url: directUrl,
      fileId: fileId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
