import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    // アクセストークン取得
    const tokenRes = await fetch(`${process.env.BASE_URL}/api/getAccessToken`);
    const tokenJson = await tokenRes.json();

    if (!tokenJson.accessToken) {
      console.error('[getOrgUnits API] AccessToken が取得できませんでした');
      return NextResponse.json({ error: 'AccessTokenが必要です' }, { status: 500 });
    }

    const domainId = process.env.LINEWORKS_DOMAIN_ID;
    if (!domainId) {
      console.error('[getOrgUnits API] LINEWORKS_DOMAIN_ID が未設定です');
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    // LINE WORKS API 呼び出し
    const { data } = await axios.get(
      `https://www.worksapis.com/v1.0/orgunits?domainId=${domainId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenJson.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 必要に応じて orgUnits のみ返却
    return NextResponse.json(data.orgUnits ?? []);
  } catch (err) {
    console.error('[getOrgUnits API] データ取得失敗:', err);
    return NextResponse.json({ error: 'OrgUnitsデータ取得失敗' }, { status: 500 });
  }
}