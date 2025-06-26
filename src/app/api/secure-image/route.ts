// src/app/api/secure-image/route.ts

import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

// Googleサービスアカウントの秘密鍵をJSON形式で環境変数から取得
const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string)

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 })
  }

  const drive = google.drive({ version: 'v3', auth })

  try {
    // まずファイルのメタ情報からmimeTypeを取得
    const fileMeta = await drive.files.get({ fileId, fields: 'mimeType' })
    const mimeType = fileMeta.data.mimeType || 'application/octet-stream'

    // ファイル本体をストリームで取得
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' as any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )

    // ストリームデータをそのままレスポンス
    // Next.jsのAPI Routeでストリーム返却には工夫が必要なので、ここでは Response オブジェクトで返す
    return new Response(res.data as any, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: unknown) {
    const error = err as { message: string }
    console.error('Drive fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}
