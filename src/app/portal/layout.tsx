// src/app/portal/layout.tsx（モバイル左端ホットゾーンで開閉：表示・非表示どちらも可｜全文）
"use client";

import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRoleContext } from "@/context/RoleContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import "@/styles/portal.css";
import "@/styles/globals.css";
import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";
import AlertBar from "@/components/AlertBar";
import { Badge, CalendarDays, ChevronDown, ChevronRight, ClipboardCheck, Home, Menu, PanelLeftClose, PanelLeftOpen, Wallet } from "lucide-react";

/** ========= Types ========= */
interface UserData {
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  photo_url: string | null;
}

interface Props { children: ReactNode }

type MobileUiMode = "old" | "new";

const MOBILE_UI_MODE_STORAGE_KEY = "myfamille-mobile-ui-mode";

function getMobilePageTitle(pathname: string): string {
  if (pathname === "/portal") return "Myファミーユ";
  if (pathname.startsWith("/portal/badge")) return "職員証";
  if (pathname.startsWith("/portal/user_salary_monthly")) return "給与明細";
  if (pathname.startsWith("/portal/shift-coordinate")) return "シフ子";
  if (pathname.startsWith("/portal/shift")) return "訪問記録";
  return "Myファミーユ";
}

function getCurrentYmJst(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  return `${y}-${m}`;
}

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

type MenuItem = { label: string; href: string; beta?: boolean; secondary?: { label: string; href: string; beta?: boolean } };
type MenuGroup = { label: string; icon: string; items: MenuItem[] };

const managerMenuGroups: MenuGroup[] = [
    { label: "数値・管理", icon: "📊", items: [
    { label: "ダッシュボード", href: "/portal/dashboard" }, { label: "イベント管理", href: "/portal/event-tasks" },
    { label: "イベントテンプレート管理", href: "/portal/event-template" }, { label: "走行距離指数", href: "/portal/driving_record" },
    { label: "組織アイコン設定", href: "/portal/orgIcons" }, { label: "電話帳", href: "/portal/phone" },
    { label: "監査ログ", href: "/portal/audit_log" }, { label: "お弁当アンケート【管理用】", href: "/portal/bento/admin" },
    { label: "目標・研修【管理用】", href: "/portal/training-goals/manage" }, { label: "健康診断管理", href: "/portal/admin/health-check-results" }, { label: "日払い申請履歴", href: "/portal/user_advance_payment_history" },
    { label: "RPAテンプレ管理", href: "/portal/rpa_temp/list" }, { label: "RPAリクエスト管理", href: "/portal/rpa_requests" }, { label: "RPA診断・DOM Snapshot", href: "/portal/rpa/diagnostics" },
  ]},
  { label: "利用者管理", icon: "👤", items: [{ label: "利用者情報", href: "/portal/kaipoke-info" }, { label: "利用者担当管理", href: "/portal/assign_matome" }, { label: "利用者書類一覧", href: "/portal/cs_docs" }] },
  { label: "シフト管理", icon: "📅", items: [{ label: "サービスコード管理", href: "/portal/shift-service-code" }, { label: "訪問記録定義", href: "/portal/shift-record-def" }, { label: "週間シフト", href: "/portal/roster/weekly" }, { label: "月間シフト", href: "/portal/roster/monthly" }, { label: "シフト表", href: "/portal/roster/daily" }, { label: "シフトWish", href: "/portal/shift-wish" }, { label: "シフト・勤務一覧", href: "/portal/shift-view" }, { label: "シフト・訪問記録", href: "/portal/shift" }, { label: "実績記録チェック", href: "/portal/disability-check" }] },
  { label: "応募者管理", icon: "👥", items: [{ label: "エントリー一覧", href: "/portal/entry-list" }, { label: "スポット募集管理", href: "/portal/spot-offer-template" }, { label: "Re-entry募集", href: "/portal/admin/re-entry-recruitment" }, { label: "タイミー応募者管理", href: "/portal/taimee-applicants" }, { label: "タイミーリスト", href: "/portal/taimee-emp" }, { label: "タイミー求人設定", href: "/portal/admin/taimee-job-settings" }, { label: "スキマバイト経費精算", href: "/portal/expense-claims" }] },
  { label: "FAX", icon: "📠", items: [{ label: "fax送信", href: "/portal/fax-sending" }, { label: "fax送信履歴", href: "/portal/fax-history" }, { label: "fax電話帳", href: "/portal/fax" }] },
];

const commonMenuGroups = (currentYm: string): MenuGroup[] => [
  { label: "人事・労務", icon: "👔", items: [{ label: "ポータルHome", href: "/portal" }, { label: "給与明細", href: "/portal/user_salary_monthly" }, { label: "処遇決定通知書", href: "/portal/notification-determination" }, { label: "健康診断結果", href: "/portal/health-check-results" }, { label: "月例会議参加チェック", href: `/portal/monthly-meeting-check?ym=${currentYm}` }, { label: "お弁当アンケート", href: "/portal/bento" }, { label: "駐車許可証申請", href: "/portal/parking_cs_places" }, { label: "目標・研修・評価", href: "/portal/training-goals" }, { label: "清算・申請", href: "/portal/wf-seisan-shinsei" }, { label: "日払い申請フォーム", href: "/portal/user_advance_payment_applications" }, { label: "職員証", href: "/portal/badge" }] },
  { label: "シフト", icon: "🕒", items: [{ label: "シフト・勤務一覧", href: "/portal/shift-view" }, { label: "シフト・訪問記録", href: "/portal/shift", secondary: { label: "β版", href: "/portal/shift-reject-performance-test", beta: true } }, { label: "シフトセルフコーディネート（シフ子）", href: "/portal/shift-coordinate", secondary: { label: "β版", href: "/portal/shift-coordinate-performance-test", beta: true } }, { label: "実績記録チェック", href: "/portal/disability-check" }] },
];

function isActiveLink(href: string, pathname: string, searchParams: ReturnType<typeof useSearchParams>) {
  const [itemPath, itemQuery] = href.split("?");
  if (pathname !== itemPath) return false;
  if (!itemQuery) return true;
  return new URLSearchParams(itemQuery).toString() === searchParams.toString();
}

function MenuLink({ item, pathname, searchParams }: { item: MenuItem; pathname: string; searchParams: ReturnType<typeof useSearchParams> }) {
  const active = isActiveLink(item.href, pathname, searchParams);
  const secondaryActive = item.secondary && isActiveLink(item.secondary.href, pathname, searchParams);
  const linkClass = (isCurrent: boolean) => `flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${isCurrent ? "border-l-4 border-sky-400 bg-sky-950/50 pl-2 font-bold text-white" : "text-blue-200 hover:bg-white/10 hover:text-white"}`;
  if (item.secondary) {
    return <div className="flex items-stretch gap-1">
      <Link href={item.href} className={`${linkClass(active)} min-w-0 flex-1`}><span className="truncate">{item.label}</span></Link>
      <Link href={item.secondary.href} className={`${linkClass(Boolean(secondaryActive))} shrink-0`}><span>{item.secondary.label}</span>{item.secondary.beta && <span className="rounded-full bg-amber-300/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-200">BETA</span>}</Link>
    </div>;
  }
  return <Link href={item.href} className={linkClass(active)}><span>{item.label}</span>{item.beta && <span className="rounded-full bg-amber-300/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-200">BETA</span>}</Link>;
}

function TreeGroup({ group, pathname, searchParams }: { group: MenuGroup; pathname: string; searchParams: ReturnType<typeof useSearchParams> }) {
  const hasActiveItem = group.items.some((item) => isActiveLink(item.href, pathname, searchParams) || Boolean(item.secondary && isActiveLink(item.secondary.href, pathname, searchParams)));
  const [isOpen, setIsOpen] = useState(hasActiveItem);
  useEffect(() => { if (hasActiveItem) setIsOpen(true); }, [hasActiveItem]);
  return <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/20">
    <button type="button" onClick={() => setIsOpen((open) => !open)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10" aria-expanded={isOpen}>
      {isOpen ? <ChevronDown size={17} aria-hidden /> : <ChevronRight size={17} aria-hidden />}<span>{group.icon} {group.label}</span>
    </button>
    {isOpen && <div className="border-t border-white/10 px-1 py-1">{group.items.map((item) => <MenuLink key={item.href} item={item} pathname={pathname} searchParams={searchParams} />)}</div>}
  </section>;
}

function LegacyMenu({ role }: { role: string | null }) {
  const normalizedRole = (role ?? "").trim().toLowerCase();
  const isManagerOrAdmin =
    normalizedRole === "manager" ||
    normalizedRole === "admin";

  const canShowAdvancePaymentMenu = isManagerOrAdmin;

  const currentYm = getCurrentYmJst();

  return (
    <ul className="mt-6 space-y-2">
      <li><Link href="/" className="text-blue-300 hover:underline">🏠 サイトHome</Link></li>
      <li><Link href="/portal" className="text-blue-300 hover:underline">📌 ポータルHome</Link></li>
      <li><Link href="/portal/user_salary_monthly" className="text-blue-300 hover:underline">💰 給与明細</Link></li>
      <li><Link href="/portal/notification-determination" className="text-blue-300 hover:underline">📄 処遇決定通知書</Link></li>
      <li><Link href="/portal/health-check-results" className="text-blue-300 hover:underline">🩺 健康診断結果</Link></li>
      {isManagerOrAdmin && (
        <>
          <li> <Link href="/portal/driving_record" className="text-blue-300 hover:underline" > 🚗 走行距離指数 </Link> </li>
          <li><Link href="/portal/dashboard" className="text-blue-300 hover:underline">ダッシュボード</Link></li>
          <li><Link href="/portal/entry-list" className="text-blue-300 hover:underline">エントリー一覧</Link></li>
          <li><Link href="/portal/admin/health-check-results" className="text-blue-300 hover:underline">健康診断管理</Link></li>
          <li><Link href="/portal/spot-offer-template" className="text-blue-300 hover:underline">スポット募集管理</Link></li>
          <li><Link href="/portal/taimee-emp" className="text-blue-300 hover:underline">タイミーリスト</Link></li>
          <li><Link href="/portal/admin/re-entry-recruitment" className="text-blue-300 hover:underline">Re-entry募集</Link></li>
          <li><Link href="/portal/orgIcons" className="text-blue-300 hover:underline">組織アイコン設定</Link></li>
          <li><Link href="/portal/kaipoke-info" className="text-blue-300 hover:underline">利用者情報</Link></li>
          <li><Link href="/portal/assign_matome" className="text-blue-300 hover:underline">利用者担当管理</Link></li>
          <li><Link href="/portal/cs_docs" className="text-blue-300 hover:underline">利用者書類一覧</Link></li>
          <li><Link href="/portal/event-tasks" className="text-blue-300 hover:underline">イベント管理</Link></li>
          <li><Link href="/portal/event-template" className="text-blue-300 hover:underline">イベントテンプレート管理</Link></li>
          <li><Link href="/portal/phone" className="text-blue-300 hover:underline">電話帳</Link></li>
          <li><Link href="/portal/fax-sending" className="text-blue-300 hover:underline">fax送信</Link></li>
          <li><Link href="/portal/fax-history" className="text-blue-300 hover:underline">fax送信履歴</Link></li>
          <li><Link href="/portal/fax" className="text-blue-300 hover:underline">fax電話帳</Link></li>
          <li><Link href="/portal/rpa_requests" className="text-blue-300 hover:underline">RPAリクエスト管理</Link></li>

<li>
  <Link
    href="/portal/admin/taimee-job-settings"
    className="text-blue-300 hover:underline"
  >
    タイミー求人設定
  </Link>
</li>

<li><Link href="/portal/rpa_temp/list" className="text-blue-300 hover:underline">RPAテンプレ管理</Link></li>
          <li><Link href="/portal/shift-service-code" className="text-blue-300 hover:underline">サービスコード管理</Link></li>
          <li><Link href="/portal/shift-record-def" className="text-blue-300 hover:underline">訪問記録定義</Link></li>
          <li><Link href="/portal/roster/weekly" className="text-blue-300 hover:underline">週間シフト</Link></li>
          <li><Link href="/portal/roster/monthly" className="text-blue-300 hover:underline">月間シフト</Link></li>
          <li><Link href="/portal/roster/daily" className="text-blue-300 hover:underline">シフト表</Link></li>
          <li><Link href="/portal/shift-wish" className="text-blue-300 hover:underline">シフトWish</Link></li>
          <li><Link href="/portal/audit_log" className="text-blue-300 hover:underline">監査ログ</Link></li>
          <li>
            <Link
              href="/portal/expense-claims"
              className="text-blue-300 hover:underline"
            >
              ｽｷﾏﾊﾞｲﾄ経費精算
            </Link>
          </li>
          <li>
            <Link
              href="/portal/bento/admin"
              className="text-blue-300 hover:underline"
            >
              お弁当アンケート【管理用】
            </Link>
          </li>
          <li>
            <Link
              href="/portal/training-goals/manage"
              className="text-blue-300 hover:underline"
            >
              目標・研修【管理用】
            </Link>
          </li>
        </>
      )}
      <li>
        <Link href="/portal/training-goals" className="text-blue-300 hover:underline">
          目標・研修・評価
        </Link>
      </li>
      <li><Link href="/portal/disability-check" className="text-blue-300 hover:underline">実績記録チェック</Link></li>
      <li>
        <Link
          href={`/portal/monthly-meeting-check?ym=${currentYm}`}
          className="text-blue-300 hover:underline"
        >
          月例会議参加チェック
        </Link>
      </li>
      <li>
        <Link
          href="/portal/bento"
          className="text-blue-300 hover:underline"
        >
          お弁当アンケート
        </Link>
      </li>
      <li><Link href="/portal/shift-view" className="text-blue-300 hover:underline">シフト・勤務一覧</Link></li>
      <li><Link href="/portal/shift" className="text-blue-300 hover:underline">シフト・訪問記録</Link></li>
      <li>
        <Link
          href="/portal/shift-reject-performance-test"
          className="inline-flex items-center gap-2 text-blue-200 hover:underline"
        >
          <span>シフト・訪問記録（β版）</span>
          <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-200">
            BETA
          </span>
        </Link>
      </li>
      <li><Link href="/portal/shift-coordinate" className="text-blue-300 hover:underline">ｼﾌﾄｾﾙﾌｺｰﾃﾞｨﾈｰﾄ（シフ子）</Link></li>
      <li>
        <Link
          href="/portal/shift-coordinate-performance-test"
          className="inline-flex items-center gap-2 text-blue-200 hover:underline"
        >
          <span>シフ子（β版）</span>
          <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-200">
            BETA
          </span>
        </Link>
      </li>
      <li><Link href="/portal/parking_cs_places" className="text-blue-300 hover:underline">駐車許可証申請</Link></li>
      <li><Link href="/portal/wf-seisan-shinsei" className="text-blue-300 hover:underline">清算・申請</Link></li>
      <li>
        <Link href="/portal/user_advance_payment_applications" className="text-blue-300 hover:underline">日払い申請フォーム
        </Link></li>

      {canShowAdvancePaymentMenu && (
        <>
          <li><Link href="/portal/user_advance_payment_history" className="text-blue-300 hover:underline">日払い申請履歴</Link></li>

        </>
      )}
      <li><Link className="text-blue-300 hover:underline" href="/portal/badge">職員証</Link></li>
      <li>
        <Link href="/lineworks-login-guide" className="hover:underline" target="_blank" rel="noopener noreferrer">
          LINE WORKSログインガイド
        </Link>
      </li>
    </ul>
  );
}

function TreeMenu({ role, onUseLegacy }: { role: string | null; onUseLegacy: () => void }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const isManagerOrAdmin = ["manager", "admin"].includes((role ?? "").trim().toLowerCase());
  const currentYm = getCurrentYmJst();
  const managerFrequentItems: MenuItem[] = [{ label: "ダッシュボード", href: "/portal/dashboard" }, { label: "エントリー一覧", href: "/portal/entry-list" }, { label: "利用者情報", href: "/portal/kaipoke-info" }, { label: "シフト表", href: "/portal/roster/daily" }];
  const commonFrequentItems: MenuItem[] = [{ label: "ポータルHome", href: "/portal" }, { label: "シフト・訪問記録", href: "/portal/shift", secondary: { label: "β版", href: "/portal/shift-reject-performance-test", beta: true } }, { label: "シフ子", href: "/portal/shift-coordinate", secondary: { label: "β版", href: "/portal/shift-coordinate-performance-test", beta: true } }, { label: "職員証", href: "/portal/badge" }];
  return <nav className="mt-5 space-y-4" aria-label="ポータルメニュー">
    <div className="rounded-lg border border-sky-300/25 bg-sky-950/25 p-2">
      <h3 className="px-2 pb-1 text-xs font-bold tracking-wide text-sky-200">よく使うメニュー</h3>
      <div className="space-y-0.5">{isManagerOrAdmin && managerFrequentItems.map((item) => <MenuLink key={item.href} item={item} pathname={pathname} searchParams={searchParams} />)}{commonFrequentItems.map((item) => <MenuLink key={item.href} item={item} pathname={pathname} searchParams={searchParams} />)}</div>
    </div>
    {isManagerOrAdmin && <div className="space-y-2"><h3 className="px-1 text-xs font-bold tracking-wide text-slate-200">管理メニュー</h3>{managerMenuGroups.map((group) => <TreeGroup key={group.label} group={group} pathname={pathname} searchParams={searchParams} />)}</div>}
    <div className="space-y-2"><h3 className="px-1 text-xs font-bold tracking-wide text-slate-200">全員共通メニュー</h3>{commonMenuGroups(currentYm).map((group) => <TreeGroup key={group.label} group={group} pathname={pathname} searchParams={searchParams} />)}</div>
    <div className="space-y-0.5 border-t border-white/20 pt-3"><MenuLink item={{ label: "🏠 サイトHome", href: "/" }} pathname={pathname} searchParams={searchParams} /><MenuLink item={{ label: "LINE WORKSログインガイド", href: "/lineworks-login-guide" }} pathname={pathname} searchParams={searchParams} /></div>
    <button type="button" onClick={onUseLegacy} className="w-full rounded-md border border-white/20 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white">旧メニューに戻す</button>
  </nav>;
}

function NavLinks({ role }: { role: string | null }) {
  const [menuMode, setMenuMode] = useState<"tree" | "legacy">("tree");
  useEffect(() => {
    const storedMode = window.localStorage.getItem("portalMenuMode");
    if (storedMode === "legacy" || storedMode === "tree") setMenuMode(storedMode);
  }, []);
  const changeMenuMode = (mode: "tree" | "legacy") => {
    window.localStorage.setItem("portalMenuMode", mode);
    setMenuMode(mode);
  };
  return menuMode === "tree" ? <TreeMenu role={role} onUseLegacy={() => changeMenuMode("legacy")} /> : <><LegacyMenu role={role} /><button type="button" onClick={() => changeMenuMode("tree")} className="mt-4 w-full rounded-md border border-white/20 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white">新メニューを使う</button></>;
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

function MobileHeader({ onOpenMenu, pathname }: { onOpenMenu: () => void; pathname: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <button
        type="button"
        aria-label="メニューを開く"
        onClick={onOpenMenu}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition active:scale-95 active:bg-slate-100"
      >
        <Menu size={24} aria-hidden />
      </button>
      <p className="ml-2 truncate text-lg font-bold text-slate-800">{getMobilePageTitle(pathname)}</p>
    </header>
  );
}

function MobileBottomNavigation({ pathname }: { pathname: string }) {
  const items = [
    { label: "ホーム", href: "/portal", icon: Home, active: pathname === "/portal" },
    { label: "職員証", href: "/portal/badge", icon: Badge, active: pathname.startsWith("/portal/badge") },
    { label: "給与", href: "/portal/user_salary_monthly", icon: Wallet, active: pathname.startsWith("/portal/user_salary_monthly") },
    { label: "シフ子", href: "/portal/shift-coordinate", icon: CalendarDays, active: pathname.startsWith("/portal/shift-coordinate") },
    { label: "訪問記録", href: "/portal/shift", icon: ClipboardCheck, active: pathname.startsWith("/portal/shift") && !pathname.startsWith("/portal/shift-coordinate") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-3px_12px_rgba(15,23,42,0.08)] backdrop-blur md:hidden" aria-label="主要メニュー" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 px-1">
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95 ${active ? "bg-orange-50 text-orange-700" : "text-slate-500 active:bg-slate-100"}`}
          >
            <Icon size={21} strokeWidth={active ? 2.5 : 2} aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
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
  // SSR・設定なし・不正値のいずれでも必ず従来UIから開始する。
  const [mobileUiMode, setMobileUiMode] = useState<MobileUiMode>("old");

  useEffect(() => {
    const savedMode = window.localStorage.getItem(MOBILE_UI_MODE_STORAGE_KEY);
    if (savedMode === "new") setMobileUiMode("new");
  }, []);

  const changeMobileUiMode = useCallback((mode: MobileUiMode) => {
    window.localStorage.setItem(MOBILE_UI_MODE_STORAGE_KEY, mode);
    setMobileUiMode(mode);
    setIsMobileMenuOpen(false);
  }, []);

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

  const useNewMobileUi = mobileUiMode === "new";

  return (
    <div className={`flex portal-container min-h-screen ${useNewMobileUi ? "mobile-app-ui" : ""}`}>
      {/* ===== 左メニュー（PC） ===== */}
      <aside className="left-menu relative h-full min-h-screen" style={{ width: asideWidth, transition: "width 0.2s ease" }}>
        {/* PC 折りたたみトグル（上部白いエリアをボタン運用でもOK） */}
        <button
          type="button"
          aria-label={isCollapsed ? "メニューを開く" : "メニューを閉じる"}
          onClick={() => setIsCollapsed((v) => !v)}
          className="absolute top-2 -right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow transition-colors hover:bg-slate-100 hover:text-slate-900"
          title={isCollapsed ? "メニュー展開" : "メニュー折りたたみ"}
        >
          {isCollapsed ? <PanelLeftOpen size={19} aria-hidden /> : <PanelLeftClose size={19} aria-hidden />}
        </button>

        {!isCollapsed && (
          <SidebarContent userData={userData} role={role} onDeletePhoto={handleDeletePhoto} onReuploadPhoto={handlePhotoReupload} />
        )}
      </aside>

      {/* ===== モバイル：左端ホットゾーン（常時固定） ===== */}
      {!useNewMobileUi && <button className="edge-hotzone" aria-label="メニューの開閉" onClick={toggleByEdge} />}

      {/* ===== モバイル：スライドメニュー ===== */}
      <nav className={`menu ${isMobileMenuOpen ? "open" : ""} ${useNewMobileUi ? "mobile-app-drawer" : ""}`} onClick={handleMobileNavClick} aria-hidden={!isMobileMenuOpen}>
        {/* ×で閉じる（メニュー上部） */}
        <button className="hamburger" aria-label="メニューを閉じる" onClick={() => setIsMobileMenuOpen(false)}>×</button>
        <SidebarContent userData={userData} role={role} onDeletePhoto={handleDeletePhoto} onReuploadPhoto={handlePhotoReupload} />
        {useNewMobileUi ? (
          <button type="button" onClick={() => changeMobileUiMode("old")} className="mx-4 mb-5 min-h-11 rounded-lg border border-white/30 px-3 text-sm font-semibold text-white transition hover:bg-white/10">旧メニューに戻す</button>
        ) : (
          <button type="button" onClick={() => changeMobileUiMode("new")} className="mx-4 mb-5 min-h-11 rounded-lg border border-white/30 px-3 text-sm font-semibold text-white transition hover:bg-white/10">新しいスマホメニューを使用する</button>
        )}
      </nav>

      {/* オーバーレイ（背景タップで閉じる） */}
      <div className={isMobileMenuOpen ? (useNewMobileUi ? "fixed inset-0 z-[35] bg-black/30" : "fixed inset-0 bg-black/30 z-[90]") : "hidden"} onClick={() => setIsMobileMenuOpen(false)} />

      {/* ===== メイン ===== */}
      {useNewMobileUi && <MobileHeader pathname={pathname ?? "/portal"} onOpenMenu={() => setIsMobileMenuOpen(true)} />}

      <main className={`flex-1 flex flex-col min-h-screen min-w-0 ${useNewMobileUi ? "mobile-app-main" : ""}`}>
        <div className="flex-1">
          {!hideAlertBar && <AlertBar />}
          {children}
        </div>
        <Footer />
      </main>
      {useNewMobileUi && <MobileBottomNavigation pathname={pathname ?? "/portal"} />}
    </div>
  );
}
