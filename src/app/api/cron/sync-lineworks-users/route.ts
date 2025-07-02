// src/app/api/cron/sync-lineworks-users/route.ts
import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';
import { fetchAllLineworksUsers } from '@/lib/lineworks/fetchAllUsers';
import { saveUsersLWTemp } from '@/lib/supabase/saveUsersLwTemp';

export async function GET() {
    try {
        const accessToken = await getAccessToken();

        // 🔽 ログ追加：アクセストークンと現在時刻
        console.log('✅ AccessToken 取得:', accessToken.slice(0, 10) + '...');
        console.log('🕒 時刻:', new Date().toISOString());

        const users = await fetchAllLineworksUsers(accessToken);
        await saveUsersLWTemp(users);

        return NextResponse.json({ message: `同期成功（${users.length}件）` });
    } catch (error: unknown) {
        console.error('❌ 同期エラー:', error);

        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ error: '不明なエラーが発生しました' }, { status: 500 });
    }
}
