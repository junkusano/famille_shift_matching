import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { createLineWorksUser } from '@/lib/lineworks/create-user';

export async function POST(req: NextRequest) {
  try {
    const {
      lwUserId,
      localName,
      lastName,
      firstName,
      orgUnitId,
      positionId,
      levelId
    }: {
      lwUserId: string;
      localName: string;
      lastName: string;
      firstName: string;
      orgUnitId: string;
      positionId?: string;
      levelId?: string;
    } = await req.json();

    // 必須チェック（positionId と levelId はオプション）
    if (!localName || !lastName || !firstName || !orgUnitId) {
      return NextResponse.json(
        { success: false, error: '必須データが不足しています' },
        { status: 400 }
      );
    }

    console.log('API側受信データ:', {
      lwUserId,
      localName,
      lastName,
      firstName,
      orgUnitId,
      positionId,
      levelId
    });

    // LINE WORKS ユーザー作成
    const result = await createLineWorksUser({
      lwUserId,
      localName,
      lastName,
      firstName,
      orgUnitId,
      positionId,
      levelId
    });

    if (!result.success) {
      console.error('LINE WORKS 作成失敗:', result.error);
      return NextResponse.json(
        { success: false, error: result.error || 'LINE WORKS アカウント作成失敗' },
        { status: 500 }
      );
    }

    // Supabase に仮パスワードを保存
    const { error: updateError } = await supabase
      .from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', localName);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
      return NextResponse.json(
        { success: false, error: 'Supabase 更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, tempPassword: result.tempPassword,userId: result.userId },
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
