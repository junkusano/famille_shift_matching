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
      { responseType: 'stream' as any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Response(res.data as any, {
      headers: {
        'Content-Type': 'image/jpeg',
      },
    })
  } catch (err: unknown) {
    const error = err as { message: string }
    console.error('Drive fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}
