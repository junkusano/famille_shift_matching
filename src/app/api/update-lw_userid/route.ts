import { NextResponse } from 'next/server';
import { updateLwUserIdMapping } from '@/lib/supabase/updateLwUserId';

export async function POST(req: Request) {
  const { userId, lwUserId } = await req.json();

  if (!userId || !lwUserId) {
    return NextResponse.json({ success: false, error: 'userId または lwUserId が未指定です' }, { status: 400 });
  }

  const result = await updateLwUserIdMapping(userId, lwUserId);
  return NextResponse.json(result);
}
