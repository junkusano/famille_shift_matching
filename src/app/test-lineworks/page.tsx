'use client';
import { useState } from 'react';

export default function TestLineWorksPage() {
  const [log, setLog] = useState<string[]>([]);

  const handleTest = async () => {
    setLog(prev => [...prev, 'テスト開始...']);
    try {
      const res = await fetch('/api/test-lineworks', { method: 'POST' });
      if (!res.ok) {
        setLog(prev => [...prev, `テストAPI失敗: HTTP ${res.status}`]);
        return;
      }
      const data = await res.json();
      setLog(prev => [...prev, `結果: ${JSON.stringify(data)}`]);
    } catch (e) {
      setLog(prev => [...prev, `エラー: ${String(e)}`]);
    }
  };

  const handleCheckAccount = async () => {
    const userId = 'junkusano';
    setLog(prev => [...prev, `${userId} のアカウント存在確認中...`]);
    try {
      const res = await fetch('/api/check-lineworks-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        setLog(prev => [...prev, `存在確認失敗: HTTP ${res.status}`]);
        return;
      }

      const data = await res.json();
      setLog(prev => [...prev, `存在確認結果: ${JSON.stringify(data)}`]);
    } catch (e) {
      setLog(prev => [...prev, `存在確認エラー: ${String(e)}`]);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">LINE WORKS テストページ</h1>
      <div className="space-x-2">
        <button
          onClick={handleTest}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          テスト送信
        </button>
        <button
          onClick={handleCheckAccount}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          アカウント確認
        </button>
      </div>
      <div className="mt-4 space-y-1">
        {log.map((line, idx) => (
          <div key={idx} className="text-sm text-gray-700">{line}</div>
        ))}
      </div>
    </div>
  );
}
