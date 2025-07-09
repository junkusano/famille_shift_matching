'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';

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

type CategoryOption = {
  id: string;
  label: string;
};

export function OrgIconsPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('');
  const [icons, setIcons] = useState<IconRecord[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const handleDelete = async (iconId: string) => {
    if (!confirm('このアイコンを削除しますか？')) return;
    const { error } = await supabase.from('org_icons').delete().eq('id', iconId);
    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else {
      fetchIcons(selectedId!);
    }
  };

  useEffect(() => {
    fetchOrgs();
    fetchCategories();
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

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('org_icons_category').select('id, label').order('sort_order');
    if (!error && data) {
      setCategoryOptions(data);
      if (data.length > 0) setCategory(data[0].id);
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
    }
  };

  const handleUpload = async () => {
    if (!selectedId || !selectedFile) return;
    setUploading(true);

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
      setUploading(false);
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
      fetchIcons(selectedId);
    }
    setUploading(false);
  };

  const getCategoryLabel = (id: string) => categoryOptions.find(opt => opt.id === id)?.label || id;

  return (
    <div className="flex gap-4">
      <div className="w-1/3 space-y-2">
        {orgs.map((org) => (
          <button
            key={org.id}
            onClick={() => setSelectedId(org.id)}
            className={`block w-full text-left p-2 border rounded ${selectedId === org.id ? 'bg-blue-100' : ''
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
                {categoryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
                {uploading ? 'アップロード中...' : 'アップロード'}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              {icons.map(icon => (
                <div key={icon.id} className="text-center relative">
                  <Image
                    src={icon.file_id}
                    alt={icon.category}
                    width={80}
                    height={80}
                    className="object-contain border rounded mx-auto"
                  />
                  <p className="text-sm mt-1">{getCategoryLabel(icon.category)}</p>
                  <button
                    onClick={() => handleDelete(icon.id)}
                    className="absolute top-0 right-1 text-red-500 hover:text-red-700"
                    title="削除"
                  >
                    <Trash2 size={16} />
                  </button>
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
