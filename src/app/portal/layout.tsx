// app/portal/layout.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRoleContext } from '@/context/RoleContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '@/styles/portal.css';
import '@/styles/globals.css';
import Image from 'next/image';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { ReactNode } from 'react';
import AlertBar from '@/components/AlertBar';

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

/** ---------- 小コンポーネント ---------- */

function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const onLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/');
  }, [router]);
  return (
    <button onClick={onLogout} className={className ?? 'text-sm hover:underline'}>
      🚪 ログアウト
    </button>
  );
}

function AvatarBlock({
  photoUrl,
  onDelete,
  onReupload,
  size = 128,
}: {
  photoUrl: string | null;
  onDelete: () => Promise<void> | void;
  onReupload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  size?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {photoUrl ? (
        <>
          <Image
            src={photoUrl}
            width={size}
            height={size}
            alt="写真"
            className="rounded-full object-cover w-full h-full"
          />
          <button
            aria-label="写真を削除"
            className="absolute bottom-0 right-0 bg-red-500 text-white text-xs px-1 py-0.5 rounded hover:bg-red-600"
            onClick={onDelete}
          >
            ×
          </button>
        </>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-full bg-gray-300 text-gray-600 text-sm rounded-full cursor-pointer">
          Upload
          <input type="file" accept="image/*" onChange={onReupload} className="hidden" />
        </label>
      )}
    </div>
  );
}

function NavLinks({ role }: { role: string | null }) {
  const isManagerOrAdmin = ['manager', 'admin'].includes(role ?? '');
  return (
    <ul className="mt-6 space-y-2">
      <li>
        <Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link>
      </li>
      <li>
        <Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link>
      </li>

      {isManagerOrAdmin && (
        <li>
          <Link href="/portal/entry-list" className="text-blue-300 hover:underline">エントリー一覧</Link>
        </li>
      )}

      {isManagerOrAdmin && (
        <>
          <li><Link href="/portal/orgIcons" className="text-blue-300 hover:underline">組織アイコン設定</Link></li>
          <li><Link href="/portal/kaipoke-info" className="text-blue-300 hover:underline">利用者様情報</Link></li>
          <li><Link href="/portal/phone" className="text-blue-300 hover:underline">電話帳</Link></li>
          <li><Link href="/portal/fax-sending" className="text-blue-300 hover:underline">fax送付</Link></li>
          <li><Link href="/portal/fax" className="text-blue-300 hover:underline">fax電話帳</Link></li>
          <li><Link href="/portal/rpa_requests" className="text-blue-300 hover:underline">RPAリクエスト管理</Link></li>
          <li><Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">RPAテンプレ管理</Link></li>
          <li><Link href="/portal/shift-service-code" className="text-blue-300 hover:underline">サービスコード管理</Link></li>
          <li><Link href="/portal/shift-record-def" className="text-blue-300 hover:underline">訪問記録定義</Link></li>
          <li><Link href="/portal/roster/daily" className="text-blue-300 hover:underline">シフト表</Link></li>
          <li><Link href="/portal/shift-wish" className="text-blue-300 hover:underline">シフトWish</Link></li>
        </>
      )}

      <li>
        <Link href="/portal/shift" className="text-blue-300 hover:underline">シフト・訪問記録</Link>
      </li>
      <li>
        <Link href="/portal/shift-coordinate" className="text-blue-300 hover:underline">ｼﾌﾄｾﾙﾌｺｰﾃﾞｨﾈｰﾄ（シフ子）</Link>
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
  );
}

function UserHeader({ userData, role }: { userData: UserData; role: string | null }) {
  return (
    <>
      <h2 className="text-xl font-semibold">
        {userData.last_name_kanji} {userData.first_name_kanji}
      </h2>
      <p className="text-white font-semibold text-sm mt-1 drop-shadow-sm">
        ユーザー権限: {role}
      </p>
    </>
  );
}

/** ---------- メイン ---------- */

export default function PortalLayout({ children }: Props) {
  const router = useRouter();
  const { role, loading } = useRoleContext();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleDeletePhoto = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('form_entries')
      .update({ photo_url: null })
      .eq('auth_uid', user.id);
    if (!error) {
      setUserData((prev) => (prev ? { ...prev, photo_url: null } : prev));
    } else {
      alert('削除に失敗しました: ' + error.message);
    }
  }, []);

  const handlePhotoReupload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', `user_photo_${Date.now()}_${file.name}`);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await res.json();
    const url = result.url;
    if (!url) {
      alert('アップロード失敗');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('form_entries')
      .update({ photo_url: url })
      .eq('auth_uid', user.id);
    if (!error) {
      setUserData((prev) => (prev ? { ...prev, photo_url: url } : prev));
    } else {
      alert('更新に失敗しました: ' + error.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (!cancelled) setUserData(entryData);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ローディング
  if (loading || !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse text-gray-500">Loading...</p>
      </div>
    );
  }

  // bodyスクロール制御
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  return (
    <div className="flex portal-container min-h-screen">
      {/* ハンバーガー */}
      <button
        className="hamburger"
        aria-label="メニューを開閉"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((v) => !v)}
      >
        ☰
      </button>

      {/* スマホ用メニュー */}
      <aside className={`menu ${isMenuOpen ? 'open' : ''}`} aria-hidden={!isMenuOpen}>
        <div className="ml-4">
          <UserHeader userData={userData} role={role} />
        </div>
        <div className="ml-4 mt-3">
          <AvatarBlock photoUrl={userData.photo_url} onDelete={handleDeletePhoto} onReupload={handlePhotoReupload} size={128} />
        </div>
        <div className="ml-4">
          <NavLinks role={role} />
          <hr className="border-white my-2" />
          <LogoutButton className="text-sm text-red-300 hover:underline" />
          <hr className="border-white my-2" />
        </div>
      </aside>

      {/* PC用左メニュー */}
      <aside className="left-menu flex flex-col justify-between h-full min-h-screen">
        <div>
          <UserHeader userData={userData} role={role} />
          <div className="mt-3">
            <AvatarBlock photoUrl={userData.photo_url} onDelete={handleDeletePhoto} onReupload={handlePhotoReupload} size={128} />
          </div>
          <NavLinks role={role} />
        </div>
        <div className="pt-4">
          <hr className="border-white my-2" />
          <LogoutButton className="text-sm text-red-500 hover:underline" />
          <hr className="border-white my-2" />
        </div>
      </aside>

      {/* メイン */}
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        <div className="flex-1">
          <AlertBar />
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
