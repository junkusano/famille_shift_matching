import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const fileValue = formData.get("file");
    const filenameValue = formData.get("filename");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { error: "ファイルが指定されていません" },
        { status: 400 }
      );
    }

    if (typeof filenameValue !== "string" || filenameValue.trim() === "") {
      return NextResponse.json(
        { error: "ファイル名が指定されていません" },
        { status: 400 }
      );
    }

    if (fileValue.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "ファイルは4MB以下にしてください" },
        { status: 400 }
      );
    }

    const folderId = process.env.GOOGLE_DRIVE_MEAL_COST_FOLDER_ID;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!folderId) {
      console.error("GOOGLE_DRIVE_MEAL_COST_FOLDER_ID is not configured");
      return NextResponse.json(
        { error: "食事代領収書の保存先が設定されていません" },
        { status: 500 }
      );
    }

    if (!serviceAccountKey) {
      console.error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
      return NextResponse.json(
        { error: "Google Drive認証情報が設定されていません" },
        { status: 500 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountKey),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });
    const buffer = Buffer.from(await fileValue.arrayBuffer());

    const uploadResult = await drive.files.create({
      requestBody: {
        name: filenameValue,
        parents: [folderId],
      },
      media: {
        mimeType: fileValue.type || "application/octet-stream",
        body: bufferToStream(buffer),
      },
      supportsAllDrives: true,
      fields: "id,name,mimeType,webViewLink",
    });

    const fileId = uploadResult.data.id;
    if (!fileId) {
      throw new Error("Google DriveからファイルIDが返されませんでした");
    }

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
        allowFileDiscovery: false,
      },
      supportsAllDrives: true,
    });

    return NextResponse.json({
      url: `https://drive.google.com/uc?export=view&id=${fileId}`,
      fileId,
      name: uploadResult.data.name,
      mimeType: uploadResult.data.mimeType,
      webViewLink: uploadResult.data.webViewLink,
    });
  } catch (error) {
    console.error("[meal-cost-upload] Upload error:", error);
    return NextResponse.json(
      { error: "領収書のアップロードに失敗しました" },
      { status: 500 }
    );
  }
}