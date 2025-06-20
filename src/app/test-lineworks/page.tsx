'use client';
import { useState } from 'react';

export default function TestLineWorksPage() {
  const [log, setLog] = useState<string[]>([]);

  const handleTest = async () => {
    setLog(prev => [...prev, 'テスト開始...']);
    try {
      // テスト送信（既存の動作）
      const res = await fetch('/api/test-lineworks', {
        method: 'POST',
      });
      const data = await res.json();
      setLog(prev => [...prev, `結果: ${JSON.stringify(data)}`]);
    } catch (e) {
      setLog(prev => [...prev, `エラー: ${e}`]);
    }

    try {
      // jkusano の LINE WORKS ユーザー存在チェック
      setLog(prev => [...prev, 'jkusano のアカウント存在確認中...']);
      const resCheck = await fetch('/api/check-lineworks-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'jkusano' }),
      });
      const checkData = await resCheck.json();
      setLog(prev => [...prev, `存在確認結果: ${JSON.stringify(checkData)}`]);
    } catch (e) {
      setLog(prev => [...prev, `存在確認エラー: ${e}`]);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">LINE WORKS テストページ</h1>
      <button 
        onClick={handleTest}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        テスト送信
      </button>
      <div className="mt-4">
        {log.map((line, idx) => (
          <div key={idx} className="text-sm text-gray-700">{line}</div>
        ))}
      </div>
    </div>
  );
}
