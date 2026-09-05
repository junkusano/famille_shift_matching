"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Database, History, Landmark } from "lucide-react";
import { useRoleContext } from "@/context/RoleContext";

const links = [
  { href: "/portal/admin/knowledge", label: "ナレッジ", icon: BookOpen },
  { href: "/portal/admin/knowledge/sources", label: "情報源", icon: Database },
  { href: "/portal/admin/knowledge/runs", label: "同期履歴", icon: History },
  { href: "/portal/admin/knowledge/integrations", label: "外部連携", icon: Landmark },
];

export default function KnowledgeAdminLayout({ children }: { children: React.ReactNode }) {
  const { role, loading } = useRoleContext();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && role !== "admin") router.replace("/portal");
  }, [loading, role, router]);

  if (loading || role !== "admin") {
    return <div className="p-8 text-sm text-slate-500">アクセス権限を確認しています…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6">
      <header>
        <p className="text-sm font-semibold text-sky-700">ADMIN ONLY</p>
        <h1 className="text-2xl font-bold text-slate-900">社内ナレッジ管理</h1>
        <p className="mt-1 text-sm text-slate-600">原本へのリンク、確認状態、公開安全性、同期状況を管理します。</p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" aria-label="ナレッジ管理">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/portal/admin/knowledge" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-sky-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              <Icon size={16} aria-hidden />{label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
