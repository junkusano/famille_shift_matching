import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    // トークン取得 API 経由でトークンを取る
    const tokenRes = await fetch(`${process.env.BASE_URL}/api/getAccessToken`);
    const { accessToken } = await tokenRes.json();

    if (!accessToken) {
      return NextResponse.json({ error: 'AccessToken取得失敗' }, { status: 500 });
    }

    const domainId = process.env.LINEWORKS_DOMAIN_ID;
    if (!domainId) {
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID 未設定' }, { status: 500 });
    }

    // LINE WORKS の Level API にリクエスト
    const res = await axios.get(`https://www.worksapis.com/v1.0/levels?domainId=${domainId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return NextResponse.json(res.data);
  } catch (err) {
    console.error('[getLevels] データ取得失敗:', err);
    return NextResponse.json({ error: 'Levels取得失敗' }, { status: 500 });
  }
}
