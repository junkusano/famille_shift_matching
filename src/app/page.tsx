'use client';

import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  return (
    <main className="min-h-screen bg-famille text-gray-800 px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* ロゴと見出し */}
        <div className="text-center space-y-4">
          <a href="https://www.shi-on.net" target="_blank" rel="noopener noreferrer">
            <Image
              src="/myfamille_logo.png"
              alt="マイファミーユのロゴマーク（合同会社施恩）"
              width={100}
              height={100}
              className="mx-auto"
            />
          </a>
          <h1 className="text-3xl sm:text-4xl font-bold text-famille">ファミーユ・ヘルパーサービスへようこそ</h1>
          <p className="text-lg text-gray-700">あなたの働き方に、もっと自由を。</p>
          {user ? (
            <p className="text-sm text-gray-600">ログイン中: {user.email}</p>
          ) : (
            <a href="/login" className="text-blue-600 underline">ログインはこちら</a>
          )}
        </div>

        {/* 以下略...（hero・魅力・紹介文・リンクボタン・フッター） */}
      </div>
    </main>
  );
}
