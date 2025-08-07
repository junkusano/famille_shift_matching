//import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from 'next';

// Service Role Key はサーバー側環境変数で管理
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ← service role key を使うこと！
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authUserId } = req.body;

  if (!authUserId) {
    return res.status(400).json({ error: 'authUserId が必要です' });
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('ユーザー削除失敗:', err);
  }
}
