'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SignupCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // サインイン状態を確認し、既にログイン済みならポータルへリダイレクト
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/portal');
      }
    };
    checkSession();
  }, [router]);

  const handleSetPassword = async () => {
    if (!password || password.length < 10) {
      setStatusMsg('パスワードは10文字以上にしてください');
      return;
    }

    setLoading(true);
    setStatusMsg('');

    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      console.error('パスワード更新エラー', error);
      setStatusMsg(`エラー: ${error.message}`);
    } else {
      setStatusMsg('パスワードが設定されました。ポータルへ移動します...');
      setTimeout(() => {
        router.push('/portal');
      }, 1500);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
      <h1 className="text-xl font-bold mb-4">パスワード設定</h1>
      <p className="mb-4 text-sm text-gray-600">
        認証が完了しました。新しいパスワードを入力してください。
      </p>
      <input
        type="password"
        placeholder="新しいパスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded px-3 py-2 mb-3"
      />
      <button
        onClick={handleSetPassword}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
      >
        {loading ? '設定中...' : 'パスワードを設定'}
      </button>
      {statusMsg && <p className="mt-2 text-sm text-red-500">{statusMsg}</p>}
    </div>
  );
}
