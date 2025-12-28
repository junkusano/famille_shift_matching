// src/app/portal/layout.tsx（モバイル左端ホットゾーンで開閉：表示・非表示どちらも可｜全文）
"use client";

import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRoleContext } from "@/context/RoleContext";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import "@/styles/portal.css";
import "@/styles/globals.css";
import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";
import AlertBar from "@/components/AlertBar";

/** ========= Types ========= */
interface UserData {
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  photo_url: string | null;
}

interface Props { children: ReactNode }

/** ========= Small components ========= */
function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const onLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [router]);
  return (
    <button onClick={onLogout} className={className ?? "text-sm hover:underline"}>
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
          <Image src={photoUrl} width={size} height={size} alt="写真" className="rounded-full object-cover w-full h-full" />
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
  const isManagerOrAdmin = ["manager", "admin"].includes(role ?? "");
  return (
    <ul className="mt-6 space-y-2">
      <li><Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link></li>
      <li><Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link></li>
      {isManagerOrAdmin && (
        <>

          <li><Link href="/portal/entry-list" className="text-blue-300 hover:underline">エントリー一覧</Link></li>
          <li><Link href="/portal/taimee-emp" className="text-blue-300 hover:underline">タイミーリスト</Link></li>
          <li><Link href="/portal/orgIcons" className="text-blue-300 hover:underline">組織アイコン設定</Link></li>
          <li><Link href="/portal/kaipoke-info" className="text-blue-300 hover:underline">利用者情報</Link></li>
          <li><Link href="/portal/assign_matome" className="text-blue-300 hover:underline">利用者担当管理</Link></li>
          <li><Link href="/portal/cs_docs" className="text-blue-300 hover:underline">利用者書類一覧</Link></li>
          <li><Link href="/portal/phone" className="text-blue-300 hover:underline">電話帳</Link></li>
          <li><Link href="/portal/fax-sending" className="text-blue-300 hover:underline">fax送付</Link></li>
          <li><Link href="/portal/fax" className="text-blue-300 hover:underline">fax電話帳</Link></li>
          <li><Link href="/portal/rpa_requests" className="text-blue-300 hover:underline">RPAリクエスト管理</Link></li>
          <li><Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">RPAテンプレ管理</Link></li>
          <li><Link href="/portal/shift-service-code" className="text-blue-300 hover:underline">サービスコード管理</Link></li>
          <li><Link href="/portal/shift-record-def" className="text-blue-300 hover:underline">訪問記録定義</Link></li>
          <li><Link href="/portal/roster/weekly" className="text-blue-300 hover:underline">週間シフト</Link></li>
          <li><Link href="/portal/roster/monthly" className="text-blue-300 hover:underline">月間シフト</Link></li>
          <li><Link href="/portal/roster/daily" className="text-blue-300 hover:underline">シフト表</Link></li>
          <li><Link href="/portal/shift-wish" className="text-blue-300 hover:underline">シフトWish</Link></li>
          <li><Link href="/portal/audit_log" className="text-blue-300 hover:underline">監査ログ</Link></li>
        </>
      )}
      <li><Link href="/portal/disability-check" className="text-blue-300 hover:underline">実績記録チェック</Link></li>
      <li><Link href="/portal/shift-view" className="text-blue-300 hover:underline">シフト・勤務一覧</Link></li>
      <li><Link href="/portal/shift" className="text-blue-300 hover:underline">シフト・訪問記録</Link></li>
      <li><Link href="/portal/shift-coordinate" className="text-blue-300 hover:underline">ｼﾌﾄｾﾙﾌｺｰﾃﾞｨﾈｰﾄ（シフ子）</Link></li>
      <li><Link className="text-blue-300 hover:underline" href="/portal/badge">職員証</Link></li>
      <li>
        <Link href="/lineworks-login-guide" className="hover:underline" target="_blank" rel="noopener noreferrer">
          LINE WORKSログインガイド
        </Link>
      </li>
    </ul>
  );
}

function UserHeader({ userData, role }: { userData: UserData; role: string | null }) {
  return (
    <>
      <h2 className="text-xl font-semibold">{userData.last_name_kanji} {userData.first_name_kanji}</h2>
      <p className="text-white font-semibold text-sm mt-1 drop-shadow-sm">ユーザー権限: {role}</p>
    </>
  );
}

function SidebarContent({
  userData,
  role,
  onDeletePhoto,
  onReuploadPhoto,
}: {
  userData: UserData;
  role: string | null;
  onDeletePhoto: () => Promise<void> | void;
  onReuploadPhoto: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}) {
  return (
    <div className="flex flex-col justify-between h-full px-4 py-3">
      <div>
        <UserHeader userData={userData} role={role} />
        <div className="mt-3">
          <AvatarBlock photoUrl={userData.photo_url} onDelete={onDeletePhoto} onReupload={onReuploadPhoto} size={128} />
        </div>
        <NavLinks role={role} />
      </div>
      <div className="pt-4">
        <hr className="border-white my-2" />
        <LogoutButton className="text-sm text-red-500 hover:underline" />
        <hr className="border-white my-2" />
      </div>
    </div>
  );
}

/** ========= Main layout ========= */
export default function PortalLayout({ children }: Props) {
  const router = useRouter();
  const { role, loading } = useRoleContext();
  const [userData, setUserData] = useState<UserData | null>(null);

  const pathname = usePathname();
  const hideAlertBar =
    (pathname?.startsWith("/portal/roster/monthly/print-view") ||
      pathname?.startsWith("/portal/roster/monthly/shift-record-view")) ?? false;

  // PC向け：左メニュー折りたたみ
  const [isCollapsed, setIsCollapsed] = useState(false);
  // モバイル向け：スライドメニュー開閉
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleDeletePhoto = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    const { error } = await supabase.from("form_entries").update({ photo_url: null }).eq("auth_uid", user.id);
    if (!error) setUserData((prev) => (prev ? { ...prev, photo_url: null } : prev));
    else alert("削除に失敗しました: " + error.message);
  }, []);

  const handlePhotoReupload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("filename", `user_photo_${Date.now()}_${file.name}`);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const result = await res.json();
    const url: string | undefined = result?.url;
    if (!url) { alert("アップロード失敗"); return; }
    const { data } = await supabase.auth.getUser();
    const user = data?.user; if (!user) return;
    const { error } = await supabase.from("form_entries").update({ photo_url: url }).eq("auth_uid", user.id);
    if (!error) setUserData((prev) => (prev ? { ...prev, photo_url: url } : prev));
    else alert("更新に失敗しました: " + error.message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) { router.push("/login"); return; }
      const { data: entryData } = await supabase
        .from("form_entries")
        .select("last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url")
        .eq("auth_uid", user.id)
        .single();
      if (!cancelled && entryData) setUserData(entryData as UserData);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (loading || !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse text-gray-500">Loading...</p>
      </div>
    );
  }

  const asideWidth = isCollapsed ? 18 : 280; // PC折りたたみ時は細いタブ幅

  // モバイル：メニュー内リンクを押したら自動で閉じる
  const handleMobileNavClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a) setIsMobileMenuOpen(false);
  };

  // モバイル：左端ホットゾーンをタップで開閉（表示・非表示どちらも）
  const toggleByEdge = () => setIsMobileMenuOpen((v) => !v);

  return (
    <div className="flex portal-container min-h-screen">
      {/* ===== 左メニュー（PC） ===== */}
      <aside className="left-menu relative h-full min-h-screen" style={{ width: asideWidth, transition: "width 0.2s ease" }}>
        {/* PC 折りたたみトグル（上部白いエリアをボタン運用でもOK） */}
        <button
          type="button"
          aria-label={isCollapsed ? "メニューを開く" : "メニューを閉じる"}
          onClick={() => setIsCollapsed((v) => !v)}
          className="absolute top-2 -right-3 z-20 bg-white border rounded-full w-6 h-6 shadow flex items-center justify-center text-sm"
          title={isCollapsed ? "メニュー展開" : "メニュー折りたたみ"}
        >
          {isCollapsed ? "▶" : "◀"}
        </button>

        {!isCollapsed && (
          <SidebarContent userData={userData} role={role} onDeletePhoto={handleDeletePhoto} onReuploadPhoto={handlePhotoReupload} />
        )}
      </aside>

      {/* ===== モバイル：左端ホットゾーン（常時固定） ===== */}
      <button className="edge-hotzone" aria-label="メニューの開閉" onClick={toggleByEdge} />

      {/* ===== モバイル：スライドメニュー ===== */}
      <nav className={`menu ${isMobileMenuOpen ? "open" : ""}`} onClick={handleMobileNavClick} aria-hidden={!isMobileMenuOpen}>
        {/* ×で閉じる（メニュー上部） */}
        <button className="hamburger" aria-label="メニューを閉じる" onClick={() => setIsMobileMenuOpen(false)}>×</button>
        <SidebarContent userData={userData} role={role} onDeletePhoto={handleDeletePhoto} onReuploadPhoto={handlePhotoReupload} />
      </nav>

      {/* オーバーレイ（背景タップで閉じる） */}
      <div className={isMobileMenuOpen ? "fixed inset-0 bg-black/30 z-[90]" : "hidden"} onClick={() => setIsMobileMenuOpen(false)} />

      {/* ===== メイン ===== */}
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        <div className="flex-1">
          {!hideAlertBar && <AlertBar />}
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
