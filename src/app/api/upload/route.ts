// /api/upload/route.ts
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

type UploadTarget = "generic" | "parking_cs_places";
type PictureSlot = "picture1" | "picture2";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const filenameRaw = formData.get("filename");
    const filename =
      typeof filenameRaw === "string" && filenameRaw.trim()
        ? filenameRaw.trim()
        : file?.name?.trim() || `${Date.now()}_upload`;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // 既存呼び出しを壊さないため、target未指定なら generic 扱い
    const targetRaw = formData.get("target");
    const target: UploadTarget =
      targetRaw === "parking_cs_places" ? "parking_cs_places" : "generic";

    // parking用の追加情報
    const placeIdRaw = formData.get("placeId");
    const pictureSlotRaw = formData.get("pictureSlot");

    const placeId =
      typeof placeIdRaw === "string" && placeIdRaw.trim()
        ? placeIdRaw.trim()
        : null;

    const pictureSlot: PictureSlot | null =
      pictureSlotRaw === "picture1" || pictureSlotRaw === "picture2"
        ? pictureSlotRaw
        : null;

    console.log("[upload] start", {
      target,
      filename,
      hasFile: !!file,
      placeId,
      pictureSlot,
    });

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });
    const buffer = Buffer.from(await file.arrayBuffer());

    // 必要なら後で target別に保存フォルダを分けられるように変数化
    const parentFolderId = "1N1EIT1escqpNREOfwc70YgBC8JVu78j2";

    const uploadRes = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [parentFolderId],
      },
      media: {
        mimeType: file.type || undefined,
        body: bufferToStream(buffer),
      },
      supportsAllDrives: true,
      fields: "id,name,mimeType",
    });

    const fileId = uploadRes.data.id;

    if (!fileId) {
      console.error("[upload] drive upload failed: fileId missing");
      return NextResponse.json(
        { error: "Drive upload failed: fileId missing" },
        { status: 500 }
      );
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

    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    console.log("[upload] drive upload ok", {
      fileId,
      directUrl,
      mimeType: file.type || null,
    });

    // generic は従来通り URL を返すだけ
    if (target === "generic") {
      return NextResponse.json({
        ok: true,
        mode: "generic",
        url: directUrl,
        fileId,
        filename,
        mimeType: file.type || uploadRes.data.mimeType || null,
      });
    }

    // parking_cs_places は DB 更新も行う
    if (target === "parking_cs_places") {
      if (!placeId) {
        return NextResponse.json(
          { error: "Missing placeId for parking_cs_places upload" },
          { status: 400 }
        );
      }

      if (!pictureSlot) {
        return NextResponse.json(
          { error: "Missing or invalid pictureSlot (picture1 or picture2)" },
          { status: 400 }
        );
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        console.error("[upload] missing supabase env");
        return NextResponse.json(
          { error: "Missing Supabase environment variables" },
          { status: 500 }
        );
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const updatePayload =
        pictureSlot === "picture1"
          ? {
              picture1_url: directUrl,
              updated_at: new Date().toISOString(),
            }
          : {
              picture2_url: directUrl,
              updated_at: new Date().toISOString(),
            };

      console.log("[upload] before db update", {
        placeId,
        pictureSlot,
        updatePayload,
      });

      const { data, error } = await supabase
        .from("parking_cs_places")
        .update(updatePayload)
        .eq("id", placeId)
        .select("id, picture1_url, picture2_url");

      if (error) {
        console.error("[upload] supabase update error:", error);
        return NextResponse.json(
          {
            error: "DB update failed",
            detail: error.message,
          },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        console.error("[upload] no rows updated", { placeId });
        return NextResponse.json(
          {
            error: "No matching parking_cs_places row found",
            placeId,
          },
          { status: 404 }
        );
      }

      console.log("[upload] db update ok", data[0]);

      return NextResponse.json({
        ok: true,
        mode: "parking_cs_places",
        url: directUrl,
        fileId,
        filename,
        mimeType: file.type || uploadRes.data.mimeType || null,
        updatedRow: data[0],
      });
    }

    return NextResponse.json(
      { error: "Unsupported upload target" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[upload] fatal error:", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}