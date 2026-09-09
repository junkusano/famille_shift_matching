import { NextResponse } from 'next/server';
import { updateLwUserIdMapping } from '@/lib/supabase/updateLwUserId'; // ✅ libからimport

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, lwUserId } = body;

    console.log('[API/update-lw-userid] 受信:', body);

    if (!userId || !lwUserId) {
      return NextResponse.json(
        { success: false, error: 'userId または lwUserId が未指定です' },
        { status: 400 }
      );
    }

    const result = await updateLwUserIdMapping(userId, lwUserId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[API/update-lw-userid] 例外エラー:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
