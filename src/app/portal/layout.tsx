'use client';

import { useEffect, useState } from 'react';
import { useRoleContext } from '@/context/RoleContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '@/styles/portal.css';
import '@/styles/globals.css';
import Image from 'next/image';
//import { useUserRole } from '@/context/RoleContext';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { ReactNode } from 'react';

interface UserData {
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    photo_url: string | null;
}

interface Props {
    children: ReactNode;
}

export default function PortalLayout({ children }: Props) {
    const router = useRouter();
    const { role, loading } = useRoleContext();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [secureImageUrl, setSecureImageUrl] = useState<string | null>(null);
    void secureImageUrl;
    const [isMenuOpen, setIsMenuOpen] = useState(false);



    // 画像削除
    const handleDeletePhoto = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase
            .from('form_entries')
            .update({ photo_url: null })
            .eq('auth_uid', user.id);

        if (!error) {
            setUserData((prev) => prev ? { ...prev, photo_url: null } : prev);
        } else {
            alert("削除に失敗しました: " + error.message);
        }
    };

    // 画像アップロード
    const handlePhotoReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("filename", `user_photo_${Date.now()}_${file.name}`);
        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });
        const result = await res.json();
        const url = result.url;
        if (!url) {
            alert("アップロード失敗");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('form_entries')
            .update({ photo_url: url })
            .eq('auth_uid', user.id);

        if (!error) {
            setUserData((prev) => prev ? { ...prev, photo_url: url } : prev);
        } else {
            alert("更新に失敗しました: " + error.message);
        }
    };

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
                setSecureImageUrl(`/api/secure-image?fileId=${encodeURIComponent(entryData.photo_url)}`);
            }
        };
        fetchUserData();
    }, [router]);

    // ロール or ユーザーデータ未確定なら一旦ローディング
    if (loading || !userData) return <p>Loading...</p>;

    return (
        <div className="flex portal-container min-h-screen">
            {/* ハンバーガーメニュー */}
            <button className="hamburger" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                ☰
            </button>

            {/* スマホ用メニュー */}
            <div className={`menu ${isMenuOpen ? 'open' : ''}`}>
                <h2 className="text-xl font-semibold ml-4">
                    {userData.last_name_kanji} {userData.first_name_kanji}
                </h2>
                <p className="text-white font-semibold text-sm ml-4 mt-1 drop-shadow-sm">
                    ユーザー権限: {role}
                </p>

                <div className="relative w-32 h-32">
                    {userData.photo_url ? (
                        <>
                            <Image
                                src={userData.photo_url}
                                width={128}
                                height={128}
                                alt="写真"
                                className="rounded-full object-cover w-full h-full"
                            />
                            <button
                                className="absolute bottom-0 right-0 bg-red-500 text-white text-xs px-1 py-0.5 rounded hover:bg-red-600"
                                onClick={handleDeletePhoto}
                            >
                                ×
                            </button>
                        </>
                    ) : (
                        <label className="flex flex-col items-center justify-center w-full h-full bg-gray-300 text-gray-600 text-sm rounded-full cursor-pointer">
                            Upload
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoReupload}
                                className="hidden"
                            />
                        </label>
                    )}
                </div>

                <ul className="mt-6 ml-4 space-y-2">
                    <li>
                        <Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link>
                    </li>
                    <li>
                        <Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link>
                    </li>
                    {(role === 'manager' || role === 'admin') && (
                        <li>
                            <Link href="/portal/entry-list" className="text-blue-300 hover:underline">
                                エントリー一覧
                            </Link>
                        </li>
                    )}
                    {(role === 'manager' || role === 'admin') && (
                        <>
                            <li>
                                <Link href="/portal/orgIcons" className="text-blue-300 hover:underline">
                                    組織アイコン設定
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/kaipoke-info" className="text-blue-300 hover:underline">
                                    利用者様情報
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/phone" className="text-blue-300 hover:underline">
                                    電話帳
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/fax-sending" className="text-blue-300 hover:underline">
                                    fax送付
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/fax" className="text-blue-300 hover:underline">
                                    fax電話帳
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/rpa_requests" className="text-blue-300 hover:underline">
                                    RPAリクエスト管理
                                </Link>
                            </li>
                            <li>
                                <Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">
                                    RPAテンプレ管理
                                </Link>
                            </li>
                        </>
                    )}
                    <li>
                        <Link href="/portal/shift" className="text-blue-300 hover:underline">
                            シフト（お休み希望も）
                        </Link>
                    </li>
                    <li>
                        <Link href="/portal/shift-coordinate" className="text-blue-300 hover:underline">
                            ｼﾌﾄｾﾙﾌｺｰﾃﾞｨﾈｰﾄ（シフ子）
                        </Link>
                    </li>
                    <li>
                        <Link className="text-blue-300 hover:underline" href="/portal/badge">職員証</Link>
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

                <div className="ml-4 mt-4">
                    <hr className="border-white my-2" />
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            router.push('/');
                        }}
                        className="text-sm text-red-300 hover:underline"
                    >
                        🚪 ログアウト
                    </button>
                    <hr className="border-white my-2" />
                </div>
            </div>

            {/* PC用左メニュー */}
            <div className="left-menu flex flex-col justify-between h-full min-h-screen">
                <div>
                    <h2 className="text-xl font-semibold">
                        {userData.last_name_kanji} {userData.first_name_kanji}
                    </h2>
                    <p className="text-white font-semibold text-sm mt-1 drop-shadow-sm">ユーザー権限: {role}</p>

                    <div className="relative w-32 h-32">
                        {userData.photo_url ? (
                            <>
                                <Image
                                    src={userData.photo_url}
                                    width={128}
                                    height={128}
                                    alt="写真"
                                    className="rounded-full object-cover w-full h-full"
                                />
                                <button
                                    className="absolute bottom-0 right-0 bg-red-500 text-white text-xs px-1 py-0.5 rounded hover:bg-red-600"
                                    onClick={handleDeletePhoto}
                                >
                                    ×
                                </button>
                            </>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-full bg-gray-300 text-gray-600 text-sm rounded-full cursor-pointer">
                                Upload
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoReupload}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>

                    <ul className="mt-6 space-y-2">
                        <li>
                            <Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link>
                        </li>
                        <li>
                            <Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link>
                        </li>
                        {(role === 'manager' || role === 'admin') && (
                            <li>
                                <Link href="/portal/entry-list" className="text-blue-300 hover:underline">
                                    エントリー一覧
                                </Link>
                            </li>
                        )}
                        {(role === 'manager' || role === 'admin') && (
                            <>
                                <li>
                                    <Link href="/portal/orgIcons" className="text-blue-300 hover:underline">
                                        組織アイコン設定
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/kaipoke-info" className="text-blue-300 hover:underline">
                                        利用者様情報
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/phone" className="text-blue-300 hover:underline">
                                        電話帳
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/fax-sending" className="text-blue-300 hover:underline">
                                        fax送付
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/fax" className="text-blue-300 hover:underline">
                                        fax電話帳
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/rpa_requests" className="text-blue-300 hover:underline">
                                        RPAリクエスト管理
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">
                                        RPAテンプレ管理
                                    </Link>
                                </li>
                            </>
                        )}
                        <li>
                            <Link href="/portal/shift" className="text-blue-300 hover:underline">
                                シフト（お休み希望も）
                            </Link>
                        </li>
                        <li>
                            <Link href="/portal/shift-coordinate" className="text-blue-300 hover:underline">
                                ｼﾌﾄｾﾙﾌｺｰﾃﾞｨﾈｰﾄ（シフ子）
                            </Link>
                        </li>
                        <li>
                            <Link className="text-blue-300 hover:underline" href="/portal/badge">職員証</Link>
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

            {/* メインコンテンツ */}
            <div className="flex-1 flex flex-col min-h-screen">
                <div className="flex-1">
                    {children}
                </div>
                <Footer />
            </div>
        </div>
    );
}
