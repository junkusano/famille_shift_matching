'use client';

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // supabaseClient を使用
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
      {/* 🔷 ナビゲーションバー */}
      <div className="flex justify-end space-x-4 mb-4 pr-4">
        {user ? (
          <>
            <span className="text-sm text-gray-600">ログイン中: {user.email}</span>
            <Link href="/portal" className="text-blue-600 underline">ポータル</Link>
            <button onClick={handleLogout} className="text-blue-600 underline">ログアウト</button>
          </>
        ) : (
          <Link href="/login" className="text-blue-600 underline">ログイン</Link>
        )}
      </div>
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

        </div>

        {/* メインビジュアル */}
        <div className="rounded-lg overflow-hidden shadow flex justify-center bg-white">
          <Image
            src="/hero.jpg"
            alt="ファミーユのスタッフ風景"
            width={0}              // 自動で調整
            height={0}
            sizes="100vw"
            className="h-[300px] w-auto object-contain"
          />
        </div>

        {/* 特徴・魅力 */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded shadow space-y-2">
            <h2 className="text-xl font-semibold text-famille">豊富な案件数</h2>
            <p>名古屋・春日井・小牧・岩倉・北名古屋エリア等で1日100件以上。あなたに合ったお仕事がきっと見つかります。</p>
          </div>
          <div className="bg-white p-6 rounded shadow space-y-2">
            <h2 className="text-xl font-semibold text-famille">高い時給水準</h2>
            <p>身体介護なら時給2,330円〜。正当な評価と報酬で、やりがいも安心も。
              <span className="mr-1">📌</span>契約社員処遇詳細は
              <a
                href="https://www.shi-on.net/column/20240831005"
                className="underline text-blue-600 hover:text-blue-800" target="_blank" rel="noopener noreferrer"
              >
                コチラ</a>
            </p>
          </div>
        </div>

        {/* 紹介文 */}
        <div className="bg-white p-6 rounded shadow text-gray-700 space-y-4 text-base">
          <h2 className="text-xl font-semibold text-famille">
            逆風の中で、選ばれ続ける理由があります ✨
          </h2>
          <p>
            厳しさを増す訪問介護業界の中で、ファミーユは毎年着実に成長を続けています。未経験でも安心のマッチング制、スマホだけで登録完了📱、希望に応じたサービス紹介、有給100%消化、充実の資格取得支援など、自分らしく働ける仕組みがあります。
          </p>
          <p>
            現場の声をもとに改善を重ね、チームで支え合う文化があるからこそ、 経験者からも「ここでなら長く続けられる」と好評です。
          </p>
          <p>
            まずはファミーユでのリアルな体験を知ってください。働く環境の納得感と将来への期待が、きっと見えてきます 👀
          </p>

        </div>

        {/* ボタンエリア：統一デザイン */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center pt-6 items-center">
          <a href="/entry" className="button button-primary">
            登録フォームへ進む
          </a>
          <br />
          <a href="https://www.shi-on.net/recruit" className="button button-primary" target="_blank">
            ファミーユについてもっと知る
          </a>
          <br />
          <a href="https://www.shi-on.net/#contact" className="button button-primary" target="_blank">
            お問い合わせはこちら
          </a>
        </div>
        <br />
        <footer className="text-sm text-gray-400 text-center pt-10">
          合同会社施恩｜訪問介護・障害福祉サービス｜愛知県名古屋市・春日井市
        </footer>
      </div>
    </main>
  );
}
