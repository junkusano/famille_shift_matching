'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

// フォームエントリーの型（必要な部分だけ定義）
type FormEntry = {
    photo_url: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
};

export default function FamilleBadge() {
    const [userData, setUserData] = useState<FormEntry | null>(null);

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: entryData } = await supabase
                .from('form_entries')
                .select('photo_url, last_name_kanji,first_name_kanji')
                .eq('auth_uid', user.id)
                .single();

            setUserData(entryData);
        };

        fetchUserData();
    }, []);

    if (!userData) return <p>Loading...</p>;

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-md p-4 w-[320px] min-h-[540px] text-center border border-green-500">
                <div className="flex justify-start mb-2">
                    <img
                        src="/famille_aichi_logo.png"
                        alt="famille ロゴ"
                        width={100}
                        height={150}
                    />
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
                    <h2 className="text-xl font-bold text-green-700 mb-1">
                        {userData.last_name_kanji} {userData.first_name_kanji}
                    </h2>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-left">
                    <h2 className="text-base font-bold text-green-700 mb-1 whitespace-nowrap">ファミーユヘルパーサービス愛知</h2>
                    <p>所在地：〒456-0018 名古屋市熱田区新尾頭3丁目1-18 WIZ金山602</p>
                    <p>電話番号：052-990-3734</p>
                </div>
            </div>
        </div>
    );
}
