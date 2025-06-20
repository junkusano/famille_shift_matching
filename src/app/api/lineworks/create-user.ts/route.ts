import type { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/getAccessToken';
import { createLineWorksUser } from '@/lib/lineworksService';
import { supabase } from '@/lib/supabaseClient';  // 忘れずに import!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { userId, fullName, email } = req.body;
    if (!userId || !fullName || !email) {
        res.status(400).json({ error: 'Missing parameters' });
        return;
    }

    try {
        const token = await getAccessToken();
        const result = await createLineWorksUser(token, userId, fullName, email);

        if (result.success === false) {
            console.error('LINE WORKS アカウント作成失敗:', result.error);
            res.status(500).json({ success: false, error: result.error });
            return;
        }

        // Supabase 更新
        const { error: updateError } = await supabase.from('users')
            .update({ temp_password: result.tempPassword })
            .eq('user_id', userId);

        if (updateError) {
            console.error('Supabase update error:', updateError.message);
            res.status(500).json({ success: false, error: 'Failed to update Supabase' });
            return;
        }

        res.status(200).json({ success: true, tempPassword: result.tempPassword });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
