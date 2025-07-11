'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SignupCompletePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        console.log('認証中のユーザー:', session.user);

        const { data, error: updateError } = await supabase
          .from('form_entries')
          .update({ auth_uid: session.user.id })
          .eq('email', session.user.email);

        if (updateError) {
          console.error('auth_uid 更新エラー:', updateError);
          setStatusMsg('認証情報の確認中にエラーが発生しました。サポートに連絡してください。');
          setStatusType('error');
        } else {
          console.log('auth_uid 更新結果:', data);
        }

      } else {
        router.push('/login');
      }

      setSessionChecked(true);
    };

    checkSession();
  }, [router]);

  const handleSetPassword = async () => {
    if (!password || password.length < 10) {
      setStatusMsg('パスワードは10文字以上にしてください');
      setStatusType('error');
      return;
    }

    setLoading(true);
    setStatusMsg('');
    setStatusType('');

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      console.error('パスワード更新エラー', error);
      setStatusMsg(`エラー: ${error.message}`);
      setStatusType('error');
    } else {
      setStatusMsg('パスワードが設定されました。ポータルへ移動します...');
      setStatusType('success');
      setTimeout(() => {
        router.push('/portal');
      }, 1500);
    }
  };

  if (!sessionChecked) {
    return <p className="p-4 text-center">認証確認中です...</p>;
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
      <h1 className="text-xl font-bold mb-4">パスワード設定</h1>
      <p className="mb-4 text-sm text-gray-600">
        認証が完了しました。新しいパスワードを入力してください。
      </p>
      <input
        type="password"
        placeholder="新しいパスワード（10文字以上）"
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
      {statusMsg && (
        <p className={`mt-2 text-sm ${statusType === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {statusMsg}
        </p>
      )}
    </div>
  );
}
