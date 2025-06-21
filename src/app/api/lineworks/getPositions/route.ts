import { NextResponse } from 'next/server';
import { getPositionList } from '@/lib/lineworks/getPositions';

export async function GET() {
  try {
    const positions = await getPositionList();
    return NextResponse.json(positions, { status: 200 });
  } catch (err) {
    console.error('LINE WORKS 職位取得エラー:', err);
    return NextResponse.json(
      { error: 'LINE WORKS 職位取得に失敗しました' },
      { status: 500 }
    );
  }
}
