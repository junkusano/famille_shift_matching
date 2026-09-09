// "C:\Users\USER\famille_shift_matching\src\app\portal\badge\page.tsx"

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

type Attachment = {
  id: string;
  url: string | null;
  label?: string | null;
  type?: string | null;
  mimeType?: string | null;
  uploaded_at?: string | null;
  acquired_at?: string | null;
};

type FormEntry = {
  photo_url: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  attachments: Attachment[] | null; // ← 追加
};

export default function FamilleBadge() {
  const [userData, setUserData] = useState<FormEntry | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: entryData } = await supabase
        .from('form_entries')
        .select('photo_url, last_name_kanji, first_name_kanji, attachments') // ← 追加
        .eq('auth_uid', user.id)
        .single();

      setUserData(entryData as FormEntry | null);
    };

    fetchUserData();
  }, []);

  // 保有資格（typeが「資格証明書」のlabelだけを抽出、重複排除してソート）
  const qualifications = useMemo(() => {
    const list = (userData?.attachments ?? [])
      .filter(a => (a?.type === '資格証明書') && a?.label)
      .map(a => String(a.label));

    // 重複排除
    const uniq = Array.from(new Set(list));

    // 五十音（日本語）とASCIIをざっくり混在ソート
    return uniq.sort((a, b) => a.localeCompare(b, 'ja'));
  }, [userData?.attachments]);

  if (!userData) return <p>Loading...</p>;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-4 w-[320px] min-h-[560px] text-center border border-green-500">
        <div className="flex justify-start mb-2">
          <Image src="/famille_aichi_logo.png" alt="famille ロゴ" width={100} height={150} />
        </div>

        <h1 className="text-xl font-bold text-green-700 mb-1">famille バッジ</h1>
        <p className="text-sm text-gray-700 mb-4">
          このものは、<span className="font-semibold">当事業所の介護職員</span>であることを証明します。
        </p>

        <div className="rounded-lg border border-green-400 p-2 bg-green-50">
          {userData?.photo_url ? (
            <Image
              src={userData.photo_url}
              alt="ユーザー写真"
              width={150}
              height={150}
              className="mx-auto rounded-full object-cover"
            />
          ) : (
            <div className="w-[150px] h-[150px] bg-gray-300 rounded-full mx-auto flex items-center justify-center text-gray-600 text-sm">
              No Image
            </div>
          )}

          <h2 className="text-xl font-bold text-green-700 mt-2">
            {userData.last_name_kanji} {userData.first_name_kanji}
          </h2>
        </div>

        {/* ◆保有資格 */}
        <div className="mt-4 text-left">
          <div className="text-base font-bold text-green-700 flex items-center gap-2">
            <span>◆保有資格</span>
            {qualifications.length > 0 ? (
              <span className="text-xs text-gray-500">（{qualifications.length}件）</span>
            ) : null}
          </div>

          {qualifications.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {qualifications.map((q) => (
                <li
                  key={q}
                  className="text-sm px-2 py-1 bg-green-50 border border-green-200 rounded"
                >
                  {q}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-500">登録された資格はありません。</p>
          )}
        </div>

        <div className="mt-5 text-xs text-gray-500 text-left">
          <h2 className="text-base font-bold text-green-700 mb-1 whitespace-nowrap">
            ファミーユヘルパーサービス愛知
          </h2>
          <p>所在地：〒456-0018 名古屋市熱田区新尾頭3丁目1-18 WIZ金山602</p>
          <p>電話番号：052-990-3734</p>
        </div>
      </div>
    </div>
  );
}
