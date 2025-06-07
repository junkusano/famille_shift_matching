import '../styles/globals.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RoleContext } from '@/context/RoleContext';
import { createSupabaseServerClient } from '@/lib/supabaseServer'; // ✅ こちらに変更
import React from 'react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'myfamille - ファミーユポータル',
  description: 'ファミーユ職員向けの登録・マイページポータルです',
};

async function getUserRole(): Promise<string | null> {
  const supabase = createSupabaseServerClient(); // ✅ 修正後

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('system_role')
    .eq('auth_user_id', user.id)
    .single();

  return data?.system_role || null;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRole();

  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RoleContext.Provider value={role}>
          {children}
        </RoleContext.Provider>
      </body>
    </html>
  );
}
