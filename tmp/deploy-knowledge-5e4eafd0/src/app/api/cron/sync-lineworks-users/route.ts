// src/app/api/cron/sync-lineworks-users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { fetchAllLineworksUsers } from '@/lib/lineworks/fetchAllUsers';
import { saveUsersLWTemp } from '@/lib/supabase/saveUsersLwTemp';

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const users = await fetchAllLineworksUsers();
        await saveUsersLWTemp(users);

        return NextResponse.json({ message: `同期成功（${users.length}件）` });
    } catch (error: unknown) {
        console.error('❌ 同期エラー:', error);

        if (error instanceof Error) {
            const unauthorized = error.message === 'Unauthorized';
            return NextResponse.json(
                { error: unauthorized ? 'unauthorized_cron' : error.message },
                { status: unauthorized ? 401 : 500 },
            );
        }

        return NextResponse.json({ error: '不明なエラーが発生しました' }, { status: 500 });
    }
}
