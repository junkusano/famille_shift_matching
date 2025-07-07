'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

const CATEGORY_OPTIONS = [
  { id: 'blue', label: '青 - 要介護サービス' },
  { id: 'green', label: '緑 - 人事労務サポートルーム' },
  { id: 'none', label: 'なし - 個人のアイコン' },
  { id: 'orange', label: 'オレンジ - 移動支援サービス' },
  { id: 'pink', label: 'ピンク - 要支援サービス' },
  { id: 'purple', label: '紫 - 保険外サービス' },
  { id: 'yellow', label: '黄 - 相談支援' }
];

const getCategoryLabel = (id: string) => CATEGORY_OPTIONS.find(opt => opt.id === id)?.label || id;

type Org = {
  id: string;
  org_name: string;
  display_order: number;
};

type IconRecord = {
  id: string;
  org_id: string;
  category: string;
  file_id: string;
};

export function OrgIconsPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedIconUrl, setUploadedIconUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('blue');
  const [icons, setIcons] = useState<IconRecord[]>([]);

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    if (selectedId) fetchIcons(selectedId);
  }, [selectedId]);

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

  const fetchIcons = async (orgId: string) => {
    const { data, error } = await supabase.from('org_icons').select('*').eq('org_id', orgId);
    if (!error && data) {
      setIcons(data);
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

  const handleUpload = async () => {
    if (!selectedId || !selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('filename', `${selectedId}_${category}_${Date.now()}_${selectedFile.name}`);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const result = await res.json();
    const url = result.url || result.file_id || '';

    if (!url) {
      alert('アップロードに失敗しました');
      return;
    }

    const { error } = await supabase.from('org_icons').upsert({
      org_id: selectedId,
      category,
      file_name: selectedFile.name,
      file_id: url,
      file_size: selectedFile.size,
      uploaded: true,
    });

    if (error) {
      alert('保存に失敗しました: ' + error.message);
    } else {
      alert('アップロード完了');
      setUploadedIconUrl(url);
      fetchIcons(selectedId);
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
            <div className="space-y-2">
              <Input type="file" accept="image/*" onChange={handleFileChange} />
              <select
                className="w-full p-2 border rounded"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <Button onClick={handleUpload} disabled={!selectedFile}>
                アップロード
              </Button>
            </div>
            {uploadedIconUrl && (
              <div className="mt-2">
                <p className="text-sm">直近アップロードされた画像:</p>
                <Image
                  src={uploadedIconUrl}
                  alt="preview"
                  width={80}
                  height={80}
                  className="object-contain border rounded"
                />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              {icons.map(icon => (
                <div key={icon.id} className="text-center">
                  <Image
                    src={icon.file_id}
                    alt={icon.category}
                    width={80}
                    height={80}
                    className="object-contain border rounded mx-auto"
                  />
                  <p className="text-sm mt-1">{getCategoryLabel(icon.category)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-500">組織を選択してください</p>
        )}
      </div>
    </div>
  );
}
