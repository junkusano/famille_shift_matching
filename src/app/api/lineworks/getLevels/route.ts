import { NextResponse } from 'next/server';
import { getLevelList } from '@/lib/lineworks/getLevels';

export async function GET() {
  try {
    const levels = await getLevelList();
    return NextResponse.json(levels, { status: 200 });
  } catch (err) {
    console.error('LINE WORKS レベル取得エラー:', err);
    return NextResponse.json(
      { error: 'LINE WORKS レベル取得に失敗しました' },
      { status: 500 }
    );
  }
}
