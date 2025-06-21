import { NextRequest, NextResponse } from 'next/server';
import { createLineWorksUser } from '@/lib/lineworksService';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      lastName,
      firstName,
      phoneticLastName,
      phoneticFirstName,
      levelId,
      orgUnitId,
      positionId
    } = await req.json();

    if (
      !userId ||
      !lastName ||
      !firstName ||
      !phoneticLastName ||
      !phoneticFirstName ||
      !levelId ||
      !orgUnitId ||
      !positionId
    ) {
      return NextResponse.json(
        { success: false, error: '必須データが不足しています' },
        { status: 400 }
      );
    }

    console.log('API側受信データ:', {
      userId,
      lastName,
      firstName,
      phoneticLastName,
      phoneticFirstName,
      levelId,
      orgUnitId,
      positionId
    });

    const result = await createLineWorksUser(
      userId,
      lastName,
      firstName,
      phoneticLastName,
      phoneticFirstName,
      levelId,
      orgUnitId,
      positionId
    );

    if (result.success === false) {
      console.error('LINE WORKS アカウント作成失敗:', result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
      return NextResponse.json(
        { success: false, error: 'Supabase 更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, tempPassword: result.tempPassword },
      { status: 200 }
    );

  } catch (err) {
    console.error('API Error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
