// app/portal/layout.tsx
'use client';

import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import { useRoleContext } from '@/context/RoleContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '@/styles/portal.css';
import '@/styles/globals.css';
import Image from 'next/image';
import Link from 'next/link';
import Footer from '@/components/Footer';
import AlertBar from '@/components/AlertBar';

/**
 * Portal layout (client)
 * - 左メニューを PC でも折りたたみ可能（ローカル保持）
 * - スマホ用のハンバーガーも維持
 * - Hooks は常にトップレベルで呼び、条件付き呼び出しを排除
 */

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

  // 左メニュー（PC）の折りたたみ状態（ローカル永続化）
  const [navCollapsed, setNavCollapsed] = useState(false);

  // スマホ用メニューの開閉（オーバーレイ）
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // サインイン中ユーザーの表示情報
  const [userData, setUserData] = useState<UserData | null>(null);

  // 左メニューの折りたたみ状態を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem('portal:navCollapsed');
      if (saved != null) setNavCollapsed(saved === '1');
    } catch {
      // 何もしない
    }
  }, []);

  // 左メニューの折りたたみ状態を保存
  useEffect(() => {
    try {
      localStorage.setItem('portal:navCollapsed', navCollapsed ? '1' : '0');
    } catch {
      // 何もしない
    }
  }, [navCollapsed]);

  // スマホメニュー開閉に応じて body スクロールを制御
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  // ユーザーデータの取得
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
    const url = result.url as string | undefined;
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

  // ローディング表示（hooks はすべて既に初期化済み）
  if (loading || !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 上部ツールバー（PC でもメニューを折りたためるボタン） */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          {/* スマホ用ハンバーガー */}
          <button
            className="hamburger"
            aria-label="メニューを開閉"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((v) => !v)}
          >
            ☰
          </button>

          {/* PC 用：左メニュー折りたたみ */}
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50"
            title="左メニューの表示/非表示"
            aria-pressed={navCollapsed}
          >
            {navCollapsed ? '▶ メニュー' : '◀ メニューを隠す'}
          </button>
        </div>
        <div className="text-sm text-gray-500">ポータル</div>
        <div />
      </header>

      {/* 本体：左メニュー + コンテンツ */}
      <div className="flex portal-container flex-1 min-h-0">
        {/* スマホ用メニュー（オーバーレイ） */}
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

        {/* PC 用左メニュー（折りたたみ対応） */}
        <aside
          className="left-menu flex flex-col justify-between h-full min-h-screen border-r bg-[#0f172a] text-white"
          aria-hidden={navCollapsed}
          style={{
            width: navCollapsed ? 0 : 280,
            transition: 'width .15s ease-in-out',
            overflow: 'hidden',
          }}
        >
          <div>
            <div className="px-4 pt-4">
              <UserHeader userData={userData} role={role} />
            </div>
            <div className="px-4 mt-3">
              <AvatarBlock photoUrl={userData.photo_url} onDelete={handleDeletePhoto} onReupload={handlePhotoReupload} size={128} />
            </div>
            <div className="px-4">
              <NavLinks role={role} />
            </div>
          </div>
          <div className="px-4 pt-4 pb-6">
            <hr className="border-white/30 my-2" />
            <LogoutButton className="text-sm text-red-300 hover:underline" />
            <hr className="border-white/30 my-2" />
          </div>
        </aside>

        {/* コンテンツ（縦スクロールはここだけ） */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto bg-white">
          <div className="flex-1">
            <AlertBar />
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
