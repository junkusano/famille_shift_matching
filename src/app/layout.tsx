// layout.tsx（layoutは "use client" ではないまま）
import '../styles/globals.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RoleProvider from '@/components/RoleProvider'; // ← 追加

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RoleProvider>
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
