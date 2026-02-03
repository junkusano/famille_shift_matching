// =============================================================
// src/lib/cm/contracts/googleDrive.ts
// Google Drive API ヘルパー（契約書アップロード用）
//
// 共有ドライブ「ケアマネ共有ドライブ > CMシステム > 契約書」
// フォルダID: 1lmnL30gVEjWwnbkbbks5ANB4cmoPKVR2
// =============================================================

import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { Readable } from "stream";

const logger = createLogger("lib/cm/contracts/googleDrive");

// =============================================================
// 定数
// =============================================================

/** 契約書フォルダID（ケアマネ共有ドライブ > CMシステム > 契約書） */
const CONTRACT_FOLDER_ID = "1lmnL30gVEjWwnbkbbks5ANB4cmoPKVR2";

// =============================================================
// Types
// =============================================================

export type GoogleDriveUploadResult =
  | {
      ok: true;
      data: {
        fileId: string;
        fileUrl: string;
        filePath: string;
      };
    }
  | { ok: false; error: string };

export type GoogleDriveAuthResult =
  | { ok: true; credentials: Record<string, unknown> }
  | { ok: false; error: string };

// =============================================================
// 認証情報取得
// =============================================================

/**
 * Supabase Vaultからサービスアカウント認証情報を取得
 */
async function getGoogleCredentials(): Promise<GoogleDriveAuthResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc("read_secret", {
      secret_name: "google_service_account_key",
    });

    if (error || !data) {
      logger.error("Google認証情報取得エラー", { message: error?.message });
      return { ok: false, error: "認証情報の取得に失敗しました" };
    }

    const credentials = JSON.parse(data);
    return { ok: true, credentials };
  } catch (e) {
    logger.error("Google認証情報パースエラー", e as Error);
    return { ok: false, error: "認証情報のパースに失敗しました" };
  }
}

/**
 * Google Drive APIクライアントを作成
 */
async function createDriveClient() {
  const credentialsResult = await getGoogleCredentials();
  if (credentialsResult.ok === false) {
    throw new Error(credentialsResult.error);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentialsResult.credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// =============================================================
// フォルダ操作
// =============================================================

/**
 * 利用者フォルダを取得または作成
 * フォルダ名: {利用者名}（{kaipoke_cs_id}）
 */
async function getOrCreateClientFolder(
  drive: ReturnType<typeof google.drive>,
  clientName: string,
  kaipokeCsId: string
): Promise<string> {
  const folderName = `${clientName}（${kaipokeCsId}）`;

  // 既存フォルダを検索
  const searchResponse = await drive.files.list({
    q: `'${CONTRACT_FOLDER_ID}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingFolder = searchResponse.data.files?.[0];
  if (existingFolder?.id) {
    logger.info("既存の利用者フォルダを使用", {
      folderId: existingFolder.id,
      folderName,
    });
    return existingFolder.id;
  }

  // 新規フォルダを作成
  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [CONTRACT_FOLDER_ID],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const newFolderId = createResponse.data.id;
  if (!newFolderId) {
    throw new Error("フォルダ作成に失敗しました");
  }

  logger.info("利用者フォルダを新規作成", {
    folderId: newFolderId,
    folderName,
  });

  return newFolderId;
}

// =============================================================
// ファイルアップロード
// =============================================================

/**
 * 同意書PDFをGoogle Driveにアップロード
 *
 * @param pdfBuffer - PDFのバイナリデータ
 * @param clientName - 利用者名
 * @param kaipokeCsId - カイポケ利用者ID
 * @param consentedAt - 同意日時
 */
export async function uploadConsentPdfToDrive(
  pdfBuffer: Buffer,
  clientName: string,
  kaipokeCsId: string,
  consentedAt: Date
): Promise<GoogleDriveUploadResult> {
  try {
    logger.info("Google Driveアップロード開始", { kaipokeCsId, clientName });

    const drive = await createDriveClient();

    // 利用者フォルダを取得または作成
    const clientFolderId = await getOrCreateClientFolder(
      drive,
      clientName,
      kaipokeCsId
    );

    // ファイル名: {日付}_{kaipoke_cs_id}_電子契約同意書.pdf
    const dateStr = formatDateForFileName(consentedAt);
    const fileName = `${dateStr}_${kaipokeCsId}_電子契約同意書.pdf`;

    logger.info("ファイルアップロード開始", {
      fileName,
      clientFolderId,
      bufferSize: pdfBuffer.length,
    });

    // ファイルをアップロード（BufferをReadableストリームに変換）
    const bufferStream = new Readable();
    bufferStream.push(pdfBuffer);
    bufferStream.push(null);

    const uploadResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [clientFolderId],
      },
      media: {
        mimeType: "application/pdf",
        body: bufferStream,
      },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    const fileId = uploadResponse.data.id;
    const fileUrl = uploadResponse.data.webViewLink;

    if (!fileId || !fileUrl) {
      throw new Error("ファイルアップロードに失敗しました（fileId/fileUrl が空）");
    }

    // ファイルパス（表示用）
    const filePath = `契約書/${clientName}（${kaipokeCsId}）/${fileName}`;

    logger.info("Google Driveアップロード完了", {
      fileId,
      filePath,
    });

    return {
      ok: true,
      data: {
        fileId,
        fileUrl,
        filePath,
      },
    };
  } catch (e: unknown) {
    // ★ デバッグ用に直接コンソール出力
    console.log("=== GOOGLE DRIVE UPLOAD ERROR ===");
    console.log("Error type:", typeof e);
    console.log("Is Error instance:", e instanceof Error);
    console.log("Error object:", e);
    if (e instanceof Error) {
      console.log("Error message:", e.message);
      console.log("Error name:", e.name);
      console.log("Error stack:", e.stack);
    }
    console.log("=================================");

    // エラー詳細をログ出力
    let errorMessage = "Unknown error";
    let errorDetails: Record<string, unknown> = {};

    if (e instanceof Error) {
      errorMessage = e.message;
      errorDetails = {
        message: e.message,
        name: e.name,
      };

      // Google API特有のエラー情報を抽出
      const gaxiosError = e as Error & {
        response?: { data?: unknown; status?: number };
        code?: string | number;
      };
      if (gaxiosError.response) {
        errorDetails.responseData = gaxiosError.response.data;
        errorDetails.responseStatus = gaxiosError.response.status;
      }
      if (gaxiosError.code) {
        errorDetails.code = gaxiosError.code;
      }
    } else if (typeof e === "object" && e !== null) {
      try {
        errorDetails = { rawError: JSON.stringify(e) };
        errorMessage = JSON.stringify(e);
      } catch {
        errorDetails = { rawError: "Failed to stringify error" };
      }
    } else {
      errorDetails = { rawError: String(e) };
      errorMessage = String(e);
    }

    logger.error("Google Driveアップロードエラー", errorDetails);
    return { ok: false, error: errorMessage };
  }
}

// =============================================================
// ヘルパー
// =============================================================

/**
 * 日付をファイル名用フォーマットに変換
 * 例: 2026-01-20
 */
function formatDateForFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}