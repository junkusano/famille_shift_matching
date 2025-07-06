'use client';

import { useEffect, useState } from 'react';
import { supabaseAdmin } from '@/lib/supabase/service';

type Org = {
  id: string;
  org_name: string;
  display_order: number;
};

export function OrgIconsPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // 組織一覧取得（サーバーでやりたければAPIルートに）
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    const { data, error } = await supabaseAdmin
      .from('orgs')
      .select('id, org_name, display_order')
      .order('display_order', { ascending: true });

    if (!error && data) {
      setOrgs(data);
    } else {
      console.error(error);
    }
  };

  return (
    <div className="flex gap-4">
      <div className="w-1/3 space-y-2">
        {orgs.map((org) => (
          <button
            key={org.id}
            onClick={() => setSelectedId(org.id)}
            className={`block w-full text-left p-2 border rounded ${
              selectedId === org.id ? 'bg-blue-100' : ''
            }`}
          >
            {org.org_name}
          </button>
        ))}
      </div>
      <div className="w-2/3">
        {selectedId ? (
          <p>選択中の組織ID: {selectedId}（ここにアイコン一覧＋編集UIを追加）</p>
        ) : (
          <p className="text-gray-500">組織を選択してください</p>
        )}
      </div>
    </div>
  );
}
