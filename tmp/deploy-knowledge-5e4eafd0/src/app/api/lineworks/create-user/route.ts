import { NextRequest, NextResponse } from 'next/server';
import { createLineWorksUser } from '@/lib/lineworks/create-user';

export async function POST(req: NextRequest) {
  try {
    const {
      loginId,
      lastName,
      firstName,
      orgUnitId,
      positionId,
      levelId
    }: {
      loginId: string;
      lastName: string;
      firstName: string;
      orgUnitId: string;
      positionId?: string;
      levelId?: string;
    } = await req.json();

    // 必須項目チェック
    if (!loginId || !lastName || !firstName || !orgUnitId) {
      return NextResponse.json(
        { success: false, error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    const result = await createLineWorksUser({
      loginId,
      lastName,
      firstName,
      orgUnitId,
      positionId,
      levelId
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        userId: result.userId,
        tempPassword: result.tempPassword
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
