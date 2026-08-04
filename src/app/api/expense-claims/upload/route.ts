// src/app/api/expense-claims/upload/route.ts

import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google Drive上の保存先
 *
 * G:\共有ドライブ\ヘルパーサービス共有ドライブ
 * \シフトマッチングシステム
 * \uploadfiles
 * \expense_claims
 */
const EXPENSE_CLAIMS_FOLDER_ID =
    "1raWBBrn7IhOayA9t79zpCWLWbDOPPbDd";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
]);

function bufferToStream(buffer: Buffer) {
    return Readable.from(buffer);
}

function sanitizeFilename(filename: string) {
    return filename
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();

        const fileValue = formData.get("file");
        const filenameValue = formData.get("filename");

        if (!(fileValue instanceof File)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "アップロードするファイルがありません。",
                },
                { status: 400 }
            );
        }

        const file = fileValue;

        if (file.size <= 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "ファイルの内容が空です。",
                },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "ファイルサイズは20MB以下にしてください。",
                },
                { status: 400 }
            );
        }

        if (
            file.type &&
            !ALLOWED_MIME_TYPES.has(file.type)
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "アップロードできるのは画像またはPDFのみです。",
                    mimeType: file.type,
                },
                { status: 400 }
            );
        }

        const requestedFilename =
            typeof filenameValue === "string"
                ? filenameValue.trim()
                : "";

        const originalFilename =
            file.name?.trim() || "receipt";

        const sanitizedFilename = sanitizeFilename(
            requestedFilename || originalFilename
        );

        const filename =
            sanitizedFilename ||
            `expense_claim_${Date.now()}`;

        const serviceAccountKey =
            process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

        if (!serviceAccountKey) {
            console.error(
                "[expense-claims-upload] GOOGLE_SERVICE_ACCOUNT_KEY is missing"
            );

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Google Driveの認証設定がありません。",
                },
                { status: 500 }
            );
        }

        let credentials: Record<string, unknown>;

        try {
            credentials = JSON.parse(serviceAccountKey);
        } catch (error) {
            console.error(
                "[expense-claims-upload] invalid GOOGLE_SERVICE_ACCOUNT_KEY",
                error
            );

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Google Driveの認証設定が正しくありません。",
                },
                { status: 500 }
            );
        }

        console.log("[expense-claims-upload] start", {
            filename,
            originalFilename,
            mimeType: file.type || null,
            size: file.size,
            folderId: EXPENSE_CLAIMS_FOLDER_ID,
        });

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                "https://www.googleapis.com/auth/drive",
            ],
        });

        const drive = google.drive({
            version: "v3",
            auth,
        });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const uploadResult =
            await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [
                        EXPENSE_CLAIMS_FOLDER_ID,
                    ],
                },
                media: {
                    mimeType:
                        file.type ||
                        "application/octet-stream",
                    body: bufferToStream(buffer),
                },
                supportsAllDrives: true,
                fields:
                    "id,name,mimeType,size,createdTime,webViewLink,webContentLink",
            });

        const fileId = uploadResult.data.id;

        if (!fileId) {
            console.error(
                "[expense-claims-upload] fileId missing",
                uploadResult.data
            );

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Google Driveへの保存に失敗しました。",
                },
                { status: 500 }
            );
        }

        /*
         * entryと同じく、リンクを知っている人が
         * ファイルを閲覧できるようにします。
         */
        await drive.permissions.create({
            fileId,
            requestBody: {
                role: "reader",
                type: "anyone",
                allowFileDiscovery: false,
            },
            supportsAllDrives: true,
        });

        const directUrl =
            `https://drive.google.com/uc?export=view&id=${fileId}`;

        const viewUrl =
            `https://drive.google.com/file/d/${fileId}/view`;

        console.log(
            "[expense-claims-upload] success",
            {
                fileId,
                filename:
                    uploadResult.data.name || filename,
                directUrl,
                viewUrl,
            }
        );

        return NextResponse.json({
            ok: true,
            file: {
                id: fileId,
                name:
                    uploadResult.data.name || filename,
                originalName: originalFilename,
                mimeType:
                    uploadResult.data.mimeType ||
                    file.type ||
                    null,
                size:
                    uploadResult.data.size ||
                    String(file.size),
                url: directUrl,
                directUrl,
                viewUrl,
                webViewLink:
                    uploadResult.data.webViewLink ||
                    viewUrl,
                createdTime:
                    uploadResult.data.createdTime ||
                    null,
            },
        });
    } catch (error) {
        console.error(
            "[expense-claims-upload] fatal error",
            error
        );

        return NextResponse.json(
            {
                ok: false,
                error:
                    "領収書ファイルのアップロードに失敗しました。",
                detail:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            { status: 500 }
        );
    }
}