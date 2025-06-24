'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '@/styles/portal.css';
import Image from 'next/image';
import { useUserRole } from '@/context/RoleContext';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { ReactNode } from 'react';

interface UserData {
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    photo_url: string | null; // ここは Drive の fileId を格納
}

interface Props {
    children: ReactNode;
}

export default function PortalLayout({ children }: Props) {
    const router = useRouter();
    const role = useUserRole();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [secureImageUrl, setSecureImageUrl] = useState<string | null>(null);
    void secureImageUrl;

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            const { data: entryData } = await supabase
                .from('form_entries')
                .select('last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url')
                .eq('auth_uid', user.id)
                .single();

            setUserData(entryData);

            if (entryData?.photo_url) {
                // ここでAPI経由のURLを生成
                setSecureImageUrl(`/api/secure-image?fileId=${encodeURIComponent(entryData.photo_url)}`);
            }
        };

        fetchUserData();
    }, [router]);

    if (!userData) return <p>Loading...</p>;

    return (
        <div className="flex min-h-screen">
            <div className="left-menu w-64 bg-gray-800 p-4 text-white">

                <div>

                    <h2 className="text-xl font-semibold">
                        {userData.last_name_kanji} {userData.first_name_kanji}
                    </h2>
                    <p className="text-white font-semibold text-sm mt-1 drop-shadow-sm">ユーザー権限: {role}</p>

                    <div className="mt-4">
                        {userData.photo_url ? (
                            <Image
                                src={userData.photo_url}
                                width={128}
                                height={128}
                                alt="写真"
                                className="rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-600">
                                No Image
                            </div>
                        )}

                    </div>

                    <ul className="mt-6 space-y-2">
                        <li>
                            <Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link>
                        </li>
                        <li>
                            <Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link>
                        </li>

                        {role === 'manager' || role === 'admin' ? (
                            <li>
                                <Link href="/portal/entry-list" className="text-blue-300 hover:underline">
                                    エントリー一覧
                                </Link>
                            </li>
                        ) : null}
                        {role === 'admin' ? (
                            <li>
                                <Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">
                                    RPAテンプレ管理
                                </Link>
                            </li>
                        ) : null}
                        <li>
                            <span className="text-blue-300">シフトコーディネート（工事中）</span>
                        </li>
                        <li>
                            <span className="text-blue-300">職員証（バッジ：工事中）</span>
                        </li>
                        <li>
                            <Link
                                href="/lineworks-login-guide"
                                className="hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                LINE WORKSログインガイド
                            </Link>
                        </li>
                    </ul>
                </div>

                <div className="pt-4">
                    <hr className="border-white my-2" />
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            router.push('/');
                        }}
                        className="text-sm text-red-500 hover:underline"
                    >
                        🚪 ログアウト
                    </button>
                    <hr className="border-white my-2" />
                </div>
            </div>
            <div className="flex flex-col flex-1 min-h-screen">
                <div className="flex-1 p-6">
                    {children}
                </div>
                <Footer />
            </div>
        </div>
    );
}
