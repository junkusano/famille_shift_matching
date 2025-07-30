import '@styles/globals.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RoleProvider from '@/components/RoleProvider';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 公開URL（Next.js の public ディレクトリ以下の画像は直接URLでアクセス可能）
const ogImageUrl = "https://myfamille.shi-on.net/hero.jpg";

export const metadata: Metadata = {
  title: 'ファミーユ・ヘルパーサービス愛知｜訪問介護の新しいカタチ',
  description: '名古屋市・春日井市・小牧市・岩倉市で訪問介護ならファミーユ・ヘルパーサービス愛知へ。高時給・柔軟な働き方・スマホだけで簡単登録！',
  openGraph: {
    title: 'ファミーユ・ヘルパーサービス愛知｜訪問介護の新しいカタチ',
    description: '名古屋市・春日井市・小牧市・岩倉市で訪問介護ならファミーユ・ヘルパーサービス愛知へ。高時給・柔軟な働き方・スマホだけで簡単登録！',
    url: 'https://myfamille.shi-on.net/',
    siteName: 'ファミーユ・ヘルパーサービス愛知',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'ファミーユ・ヘルパーサービス愛知のイメージ',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ファミーユ・ヘルパーサービス愛知｜訪問介護の新しいカタチ',
    description: '名古屋市・春日井市・小牧市・岩倉市で訪問介護ならファミーユ・ヘルパーサービス愛知へ。高時給・柔軟な働き方・スマホだけで簡単登録！',
    images: [ogImageUrl],
  },
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
