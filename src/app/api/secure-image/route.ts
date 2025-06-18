import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

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
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' as any } // 型エラー防止のため any を明示
    )

    // Next.js API Routeでstreamを返す場合は new Response でOK
    return new Response(res.data as any, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable', // キャッシュ効率化
      },
    })
  } catch (err: any) {
    console.error('Drive fetch error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}
