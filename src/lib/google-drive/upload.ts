import "server-only";

import { google } from "googleapis";
import { Readable } from "node:stream";

export class GoogleDriveFileError extends Error {
  readonly stage: "auth" | "folder" | "upload" | "download";
  readonly cause?: unknown;

  constructor(stage: "auth" | "folder" | "upload" | "download", message: string, cause?: unknown) {
    super(message);
    this.name = "GoogleDriveFileError";
    this.stage = stage;
    this.cause = cause;
  }
}

export type GoogleDriveUploadedFile = {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
};

/** DriveのファイルID、open?id=形式、/file/d/形式のいずれからもIDを取り出す。 */
export function extractGoogleDriveFileId(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const queryId = url.searchParams.get("id");
    if (queryId) return queryId;
    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    // URLではない場合は、既にファイルIDとして扱う。
  }

  return raw;
}

function createDriveClient() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!rawCredentials) {
    throw new GoogleDriveFileError("auth", "Google Drive認証情報が設定されていません");
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(rawCredentials) as Record<string, unknown>;
  } catch (cause) {
    throw new GoogleDriveFileError("auth", "Google Drive認証情報を読み込めません", cause);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function googleStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { response?: { status?: unknown }; code?: unknown };
  const value = candidate.response?.status ?? candidate.code;
  const status = Number(value);
  return Number.isFinite(status) ? status : null;
}

export async function uploadBufferToGoogleDrive(params: {
  buffer: Buffer;
  filename: string;
  folderId: string;
  mimeType: string;
}): Promise<GoogleDriveUploadedFile> {
  let drive: ReturnType<typeof google.drive>;
  try {
    drive = createDriveClient();
  } catch (cause) {
    if (cause instanceof GoogleDriveFileError) throw cause;
    throw new GoogleDriveFileError("auth", "Google Drive認証に失敗しました", cause);
  }

  try {
    const response = await drive.files.create({
      requestBody: {
        name: params.filename,
        parents: [params.folderId],
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.buffer),
      },
      supportsAllDrives: true,
      fields: "id,name,mimeType,webViewLink",
    });
    const fileId = response.data.id;
    if (!fileId) {
      throw new Error("Google DriveからfileIdが返されませんでした");
    }
    return {
      fileId,
      name: response.data.name ?? params.filename,
      mimeType: response.data.mimeType ?? params.mimeType,
      webViewLink:
        response.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    };
  } catch (cause) {
    const status = googleStatus(cause);
    const stage = status === 401 || status === 403 ? "auth" : status === 404 ? "folder" : "upload";
    throw new GoogleDriveFileError(
      stage,
      stage === "auth"
        ? "Google Drive認証に失敗しました"
        : stage === "folder"
          ? "Google Driveの保存先フォルダが見つからないか、アクセス権がありません"
          : "Google Driveへのアップロードに失敗しました",
      cause,
    );
  }
}

export async function deleteGoogleDriveFile(fileId: string): Promise<void> {
  const drive = createDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

export async function downloadGoogleDriveFile(fileId: string): Promise<Buffer> {
  let drive: ReturnType<typeof google.drive>;
  try {
    drive = createDriveClient();
  } catch (cause) {
    if (cause instanceof GoogleDriveFileError) throw cause;
    throw new GoogleDriveFileError("auth", "Google Drive認証に失敗しました", cause);
  }

  try {
    const normalizedFileId = extractGoogleDriveFileId(fileId);
    if (!normalizedFileId) {
      throw new GoogleDriveFileError("download", "Google DriveのファイルIDが空です");
    }

    const response = await drive.files.get(
      {
        fileId: normalizedFileId,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(response.data as ArrayBuffer);
  } catch (cause) {
    const status = googleStatus(cause);
    const message =
      status === 401 || status === 403
        ? "Google DriveのPDFにアクセスする権限がありません。サービスアカウントへの共有設定を確認してください"
        : status === 404
          ? "Google Drive上に対象PDFが見つかりません。保存されているfile_idを確認してください"
          : "Google DriveからPDFを取得できませんでした";
    throw new GoogleDriveFileError(
      "download",
      message,
      cause,
    );
  }
}
