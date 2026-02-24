// =============================================================
// src/app/cm-portal/rpa-jobs/CreateJobModal.tsx
// RPAジョブ - ジョブ作成モーダル
// =============================================================

'use client';

import React, { useState, useMemo } from 'react';

type CreateJobModalProps = {
  isOpen: boolean;
  onClose: () => void;
  queues: { code: string; name: string }[];
  jobTypes: { queue_code: string; code: string; name: string }[];
  onCreate: (queue: string, jobType: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  creating: boolean;
};

export function CreateJobModal({
  isOpen,
  onClose,
  queues,
  jobTypes,
  onCreate,
  creating,
}: CreateJobModalProps) {
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedJobType, setSelectedJobType] = useState('');
  const [payloadStr, setPayloadStr] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const filteredJobTypes = useMemo(
    () => jobTypes.filter((jt) => jt.queue_code === selectedQueue),
    [jobTypes, selectedQueue]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedQueue || !selectedJobType) {
      setError('キューとジョブタイプを選択してください');
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      setError('payloadのJSON形式が不正です');
      return;
    }

    const result = await onCreate(selectedQueue, selectedJobType, payload);
    if (result.ok === true) {
      onClose();
      setSelectedQueue('');
      setSelectedJobType('');
      setPayloadStr('{}');
    } else {
      setError(result.error || 'ジョブ作成に失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">新規ジョブ作成</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                キュー
              </label>
              <select
                value={selectedQueue}
                onChange={(e) => {
                  setSelectedQueue(e.target.value);
                  setSelectedJobType('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {queues.map((q) => (
                  <option key={q.code} value={q.code}>
                    {q.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ジョブタイプ
              </label>
              <select
                value={selectedJobType}
                onChange={(e) => setSelectedJobType(e.target.value)}
                disabled={!selectedQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">選択してください</option>
                {filteredJobTypes.map((jt) => (
                  <option key={jt.code} value={jt.code}>
                    {jt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                payload (JSON)
              </label>
              <textarea
                value={payloadStr}
                onChange={(e) => setPayloadStr(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder='{"year_month": "2026-01"}'
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
