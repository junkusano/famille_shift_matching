'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Org = {
  id: string;
  org_name: string;
  display_order: number;
};

export function OrgIconsPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedIconUrl, setUploadedIconUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/orgIcons');
      if (!res.ok) throw new Error('APIエラー');

      const data = await res.json();
      setOrgs(data);
    } catch (err) {
      console.error('組織一覧の取得に失敗しました:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedIconUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile && selectedId) {
      alert(`アップロード（ダミー）: ${selectedFile.name} for Org ID: ${selectedId}`);
      // 実際のアップロード処理はここに追加
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
      <div className="w-2/3 space-y-4">
        {selectedId ? (
          <>
            <p className="font-bold">選択中の組織ID: {selectedId}</p>
            <p className="text-sm text-gray-600">（この組織に「アイコン一覧＋編集UI」を追加）</p>
            <Input type="file" accept="image/*" onChange={handleFileChange} />
            <Button onClick={handleUpload} disabled={!selectedFile}>
              アップロード
            </Button>
            {uploadedIconUrl && (
              <img
                src={uploadedIconUrl}
                alt="アップロード済アイコン"
                className="w-20 h-20 object-contain border rounded"
              />
            )}
          </>
        ) : (
          <p className="text-gray-500">組織を選択してください</p>
        )}
      </div>
    </div>
  );
}
