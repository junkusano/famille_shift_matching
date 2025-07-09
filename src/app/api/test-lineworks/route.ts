import { NextResponse } from 'next/server';

export async function POST() {
  console.log('LINE WORKS テストAPI呼ばれました');
  return NextResponse.json({ success: true, message: 'テスト成功！' });
}
