"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRoleContext } from "@/context/RoleContext";
import Image from "next/image";
import Link from "next/link";
import AlertBar from "@/components/AlertBar";
import Footer from "@/components/Footer";
import "@/styles/portal.css";
import "@/styles/globals.css";

interface UserData {
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  photo_url: string | null;
}

interface Props {
  children: React.ReactNode;
}

/* ------------------ small parts ------------------ */
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
  size = 112,
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
            className="absolute -bottom-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded hover:bg-red-600 shadow"
            onClick={onDelete}
          >
            ×
          </button>
        </>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-full bg-gray-300 text-gray-600 text-xs rounded-full cursor-pointer">
          画像を追加
          <input type="file" accept="image/*" onChange={onReupload} className="hidden" />
        </label>
      )}
    </div>
  );
}

function NavLinks({ role }: { role: string | null }) {
  const isManagerOrAdmin = ["manager", "admin"].includes(role ?? "");
  return (
    <ul className="mt-5 space-y-2 text-[14px]">
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
    <div className="space-y-1">
      <h2 className="text-lg font-semibold leading-tight">
        {userData.last_name_kanji} {userData.first_name_kanji}
      </h2>
      <p className="text-white/80 text-xs">権限: {role}</p>
    </div>
  );
}

/* ------------------ main layout ------------------ */
export default function PortalLayout({ children }: Props) {
  const router = useRouter();
  const { role, loading } = useRoleContext();

  const [userData, setUserData] = useState<UserData | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // --- restore sidebar state ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal:sidebarCollapsed");
      if (saved === "1") setSidebarCollapsed(true);
    } catch (_) {}
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const nv = !v;
      try {
        localStorage.setItem("portal:sidebarCollapsed", nv ? "1" : "0");
      } catch (_) {}
      return nv;
    });
  }, []);

  // --- fetch current user profile (client-side) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("form_entries")
        .select("last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url")
        .eq("auth_uid", user.id)
        .single();
      if (!cancelled && !error && data) setUserData(data as UserData);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // --- loading ---
  if (loading || !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-screen bg-slate-50">
      {/* Sidebar (desktop). Width collapses to 0; a small edge handle appears when collapsed. */}
      <aside
        className={`relative shrink-0 transition-[width] duration-200 bg-[#0b1f3a] text-white overflow-hidden ${
          sidebarCollapsed ? "w-0" : "w-64"
        }`}
        aria-hidden={sidebarCollapsed}
      >
        {!sidebarCollapsed && (
          <div className="flex flex-col h-full p-4 gap-4">
            <div className="flex items-start justify-between">
              <UserHeader userData={userData} role={role} />
              <button
                onClick={toggleSidebar}
                title="メニューを隠す"
                className="-mr-2 -mt-2 px-2 py-1 rounded hover:bg-white/10"
              >
                ◀
              </button>
            </div>

            <div>
              <AvatarBlock
                photoUrl={userData.photo_url}
                onDelete={async () => {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { error } = await supabase
                    .from("form_entries")
                    .update({ photo_url: null })
                    .eq("auth_uid", user.id);
                  if (!error) setUserData((prev) => (prev ? { ...prev, photo_url: null } : prev));
                }}
                onReupload={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("filename", `user_photo_${Date.now()}_${file.name}`);
                  const res = await fetch("/api/upload", { method: "POST", body: formData });
                  const result = await res.json();
                  const url = result.url as string | undefined;
                  if (!url) return;
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { error } = await supabase
                    .from("form_entries")
                    .update({ photo_url: url })
                    .eq("auth_uid", user.id);
                  if (!error) setUserData((prev) => (prev ? { ...prev, photo_url: url } : prev));
                }}
                size={112}
              />
            </div>

            <NavLinks role={role} />

            <div className="mt-auto pt-4">
              <hr className="border-white/20 my-2" />
              <LogoutButton className="text-sm text-red-300 hover:underline" />
              <hr className="border-white/20 my-2" />
            </div>
          </div>
        )}
      </aside>

      {/* Edge handle (appears only when collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          title="メニューを表示"
          className="fixed left-1 top-24 z-30 px-2 py-1 rounded bg-white border shadow"
          aria-label="メニューを表示"
        >
          ▶
        </button>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 min-h-screen flex flex-col">
        {/* NOTE: 余計な固定ヘッダーは置かず、AlertBarのみ */}
        <div className="flex-1 min-h-0">
          <AlertBar />
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
