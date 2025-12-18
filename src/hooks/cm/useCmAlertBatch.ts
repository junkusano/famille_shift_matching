// src/hooks/cm/useCmAlertBatch.ts
// CMアラートバッチ実行フック

"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CmBatchStats } from "@/types/cm/alert-batch";

type CmRunBatchResult = {
  ok: boolean;
  batchRunId?: string;
  stats?: CmBatchStats;
  error?: string;
};

type UseCmAlertBatchReturn = {
  /** バッチ実行中かどうか */
  isRunning: boolean;
  /** 最後の実行結果 */
  lastResult: CmRunBatchResult | null;
  /** エラーメッセージ */
  error: string | null;
  /** バッチを実行 */
  runBatch: () => Promise<CmRunBatchResult>;
  /** 結果をクリア */
  clearResult: () => void;
};

/**
 * CMアラートバッチを手動実行するフック
 * 
 * @example
 * ```tsx
 * const { isRunning, lastResult, error, runBatch } = useCmAlertBatch();
 * 
 * const handleClick = async () => {
 *   const result = await runBatch();
 *   if (result.ok) {
 *     console.log("バッチ完了", result.stats);
 *   }
 * };
 * ```
 */
export function useCmAlertBatch(): UseCmAlertBatchReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CmRunBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBatch = useCallback(async (): Promise<CmRunBatchResult> => {
    setIsRunning(true);
    setError(null);

    try {
      // 認証ユーザーを取得
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        const failedResult: CmRunBatchResult = {
          ok: false,
          error: "認証されていません。再ログインしてください。",
        };
        setLastResult(failedResult);
        setError(failedResult.error!);
        return failedResult;
      }

      // usersテーブルからuser_idとroleを取得
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", authData.user.id)
        .single();

      if (userError || !userData) {
        const failedResult: CmRunBatchResult = {
          ok: false,
          error: "ユーザー情報を取得できません",
        };
        setLastResult(failedResult);
        setError(failedResult.error!);
        return failedResult;
      }

      // APIを呼び出し
      const response = await fetch("/api/cm/alerts/run-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userData.user_id,
          role: userData.system_role,
        }),
        credentials: "include",
      });

      const data: CmRunBatchResult = await response.json();

      setLastResult(data);

      if (!data.ok) {
        setError(data.error || "バッチ実行に失敗しました");
      }

      return data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "通信エラー";
      setError(errorMessage);
      
      const failedResult: CmRunBatchResult = {
        ok: false,
        error: errorMessage,
      };
      setLastResult(failedResult);
      
      return failedResult;

    } finally {
      setIsRunning(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
  }, []);

  return {
    isRunning,
    lastResult,
    error,
    runBatch,
    clearResult,
  };
}