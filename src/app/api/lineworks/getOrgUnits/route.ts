import { NextResponse } from 'next/server';
import { getOrgList } from '@/lib/lineworks/getOrgUnits';

export async function GET() {
  try {
    const orgUnits = await getOrgList();
    return NextResponse.json(orgUnits, { status: 200 });
  } catch (err) {
    console.error('LINE WORKS 組織データ取得エラー:', err);
    return NextResponse.json(
      { error: 'LINE WORKS 組織データ取得に失敗しました' },
      { status: 500 }
    );
  }
}
