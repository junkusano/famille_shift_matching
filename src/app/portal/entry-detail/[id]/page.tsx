// app/portal/entry-detail/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface Certification {
  label: string;
  url: string;
}

interface EntryDetail {
  id: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  gender: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  address: string;
  postal_code: string;
  phone: string;
  email: string;
  motivation: string;
  health_condition: string;
  license_front_url?: string;
  license_back_url?: string;
  residence_card_url?: string;
  photo_url?: string;
  certifications?: Certification[];
  created_at: string;
}

export default function EntryDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [entry, setEntry] = useState<EntryDetail | null>(null);

  useEffect(() => {
    const fetchEntry = async () => {
      const { data, error } = await supabase
        .from('form_entries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('取得エラー:', error.message);
      } else {
        setEntry(data);
      }
    };

    if (id) fetchEntry();
  }, [id]);

  if (!entry) return <p className="p-4">読み込み中...</p>;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow space-y-6">
      <button
        onClick={() => router.back()}
        className="text-blue-600 underline text-sm hover:text-blue-800"
      >
        ← 一覧に戻る
      </button>

      {entry.photo_url && (
        <div className="text-center">
          <img
            src={entry.photo_url}
            alt="顔写真"
            className="inline-block h-40 w-40 rounded-full border object-cover shadow"
          />
        </div>
      )}

      <h1 className="text-2xl font-bold">エントリー詳細</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div><strong>氏名（漢字）:</strong> {entry.last_name_kanji} {entry.first_name_kanji}</div>
        <div><strong>氏名（かな）:</strong> {entry.last_name_kana} {entry.first_name_kana}</div>
        <div><strong>性別:</strong> {entry.gender}</div>
        <div><strong>生年月日:</strong> {entry.birth_year}/{entry.birth_month}/{entry.birth_day}</div>
        <div><strong>住所:</strong> 〒{entry.postal_code} {entry.address}</div>
        <div><strong>電話番号:</strong> {entry.phone}</div>
        <div><strong>メールアドレス:</strong> {entry.email}</div>
        <div><strong>健康状態:</strong> {entry.health_condition}</div>
        <div className="md:col-span-2">
          <strong>志望動機:</strong><br />{entry.motivation}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">アップロード画像</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {entry.license_front_url && <ImageThumbnail title="免許証（表）" src={entry.license_front_url} />}
          {entry.license_back_url && <ImageThumbnail title="免許証（裏）" src={entry.license_back_url} />}
          {entry.residence_card_url && <ImageThumbnail title="住民票" src={entry.residence_card_url} />}
        </div>
      </div>

      {entry.certifications && entry.certifications.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">資格証明書</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {entry.certifications.map((cert, idx) => (
              <ImageThumbnail key={idx} title={cert.label} src={cert.url} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageThumbnail({ title, src }: { title: string; src: string }) {
  return (
    <div className="text-sm text-center">
      <p className="mb-1">{title}</p>
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img
          src={src}
          alt={title}
          className="w-full h-auto max-h-48 object-contain rounded border hover:scale-105 transition-transform"
        />
      </a>
    </div>
  );
}