// =============================================================
// src/components/cm-components/layout/CmPageViewTracker.tsx
// ページ遷移を自動記録する（UIなし）
// layout.tsx の AuthGuard 内に配置し、全ページの閲覧を記録する
// =============================================================

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useCmUserContext } from "@/context/cm/CmUserContext";
import { supabase } from "@/lib/supabaseClient";
import { recordPageView } from "@/lib/cm/audit/recordPageView";

/**
 * ページ遷移記録コンポーネント（UIなし）
 *
 * - usePathname() で Next.js のクライアントナビゲーションを検知
 * - CmUserContext の user が存在する場合のみ記録（未ログイン時はスキップ）
 * - useRef で前回パスを保持し、同一パスの連続記録を防止
 * - session_id はブラウザタブ単位で crypto.randomUUID() を生成
 * - fire-and-forget: 記録の成否はユーザー操作に影響しない
 */
export function CmPageViewTracker() {
  const pathname = usePathname();
  const { user } = useCmUserContext();
  const prevPathRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!pathname || !user || pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;

    // token を取得して recordPageView を fire-and-forget で呼ぶ
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const token = data.session?.access_token ?? "";
        if (!token) return;
        recordPageView(
          { path: pathname, sessionId: sessionIdRef.current },
          token
        ).catch(() => {});
      })
      .catch(() => {});
  }, [pathname, user]);

  return null;
}
