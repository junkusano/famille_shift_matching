// =============================================================
// src/app/api/cm/fax/pdf/[fileId]/route.ts
// Google DriveのPDFを取得するプロキシAPI
// Supabase Vault方式
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { google } from "googleapis";

// =============================================================
// 型定義
// =============================================================

/** Google サービスアカウント認証情報 */
type ServiceAccountCredentials = {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
};

/** Google API エラー */
type GoogleApiError = Error & {
  code?: number;
  errors?: Array<{ message: string; domain: string; reason: string }>;
};

// =============================================================
// 認証情報キャッシュ
// =============================================================

let cachedCredentials: ServiceAccountCredentials | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1時間

/**
 * Supabase VaultからGoogle認証情報を取得
 */
async function getServiceAccountCredentials(): Promise<ServiceAccountCredentials> {
  const now = Date.now();
  
  // キャッシュが有効ならそれを返す
  if (cachedCredentials && now - cacheTimestamp < CACHE_DURATION) {
    return cachedCredentials;
  }

  // Vault から Secret を取得
  const { data, error } = await supabaseAdmin.rpc("read_secret", {
    secret_name: "google_service_account_key",
  });

  if (error) {
    console.error("[PDF Proxy] Vault読み取りエラー:", error.message);
    throw new Error(`Vault error: ${error.message}`);
  }

  if (!data) {
    throw new Error("Service account key not found in Vault");
  }

  // JSONパース
  const credentials: ServiceAccountCredentials = 
    typeof data === "string" ? JSON.parse(data) : data;
  
  // キャッシュに保存
  cachedCredentials = credentials;
  cacheTimestamp = now;

  return credentials;
}

/**
 * Google Drive APIクライアントを取得
 */
async function getDriveClient() {
  const credentials = await getServiceAccountCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

// =============================================================
// GET: PDFを取得
// =============================================================

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    // Next.js 15: params は Promise
    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      );
    }

    console.log("[PDF Proxy] Fetching PDF:", fileId);

    // Google Drive APIでファイルを取得
    const drive = await getDriveClient();

    // ファイルのメタデータを取得
    const metaRes = await drive.files.get({
      fileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });

    const fileName = metaRes.data.name || "document.pdf";
    const mimeType = metaRes.data.mimeType || "application/pdf";

    console.log("[PDF Proxy] File metadata:", { fileName, mimeType });

    // ファイルの内容を取得
    console.log("[PDF Proxy] Downloading file content...");
    
    try {
      const fileRes = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );

      console.log("[PDF Proxy] File response received, data type:", typeof fileRes.data);
      
      const buffer = Buffer.from(fileRes.data as ArrayBuffer);

      console.log("[PDF Proxy] PDF fetched successfully:", buffer.length, "bytes");

      // レスポンス
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": buffer.length.toString(),
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } catch (downloadError: unknown) {
      const err = downloadError as GoogleApiError;
      console.error("[PDF Proxy] Download error:", err.message, err.code);
      throw downloadError;
    }
  } catch (e: unknown) {
    const err = e as GoogleApiError;
    console.error("[PDF Proxy] Error:", err.message || e);

    if (err.code === 404) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    if (err.code === 403) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}