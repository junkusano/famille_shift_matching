"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // supabase-js がURL上のcode等を処理してセッション化します（環境により不要でもOK）
      // ここでは「セッションが取れたら /portal へ」の役に立ちます
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        router.replace("/portal");
      } else {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <div className="p-6 text-center">
      認証処理中...
    </div>
  );
}
