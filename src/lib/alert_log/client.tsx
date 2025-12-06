"use client";

import { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AlertStatus =
  | "open"
  | "in_progress"
  | "done"
  | "muted"
  | "cancelled";

export type AlertRow = {
  id: string;
  message: string;
  visible_roles: string[];
  status: AlertStatus;
  status_source: string;
  severity: number;
  result_comment: string | null;
  result_comment_by: string | null;
  result_comment_at: string | null;
  kaipoke_cs_id: string | null;
  user_id: string | null;
  shift_id: string | null;
  rpa_request_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * アクティブなアラート一覧取得
 * - alert_log テーブルを Supabase から直接読む
 * - open / in_progress のみ
 */
export async function fetchActiveAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alert_log")
    .select("*")
    .in("status", ["open", "in_progress"])
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[alert_log] fetchActiveAlerts error", error);
    throw new Error(error.message);
  }

  return (data ?? []) as AlertRow[];
}

/**
 * ステータス更新
 */
export async function updateAlertStatus(
  id: string,
  status: AlertStatus,
): Promise<void> {
  const { error } = await supabase
    .from("alert_log")
    .update({
      status,
      status_source: "manual",
    })
    .eq("id", id);

  if (error) {
    console.error("[alert_log] updateAlertStatus error", error);
    throw new Error(error.message);
  }
}

/**
 * コメント更新
 */
export async function updateAlertComment(
  id: string,
  comment: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("alert_log")
    .update({
      result_comment: comment,
    })
    .eq("id", id);

  if (error) {
    console.error("[alert_log] updateAlertComment error", error);
    throw new Error(error.message);
  }
}

/**
 * メッセージ文字列 → ReactNode
 * （URL をリンク化する処理）
 */
export function renderAlertMessage(msg: string): ReactNode {
  // ① すでに <a> タグ入りの HTML として渡ってくるパターン
  if (msg.includes("<a ")) {
    return (
      <span
        className="alert-html"
        dangerouslySetInnerHTML={{ __html: msg }}
      />
    );
  }

  // ② プレーンな URL を含むメッセージをパースしてリンクにする
  const urlRegex =
    /https:\/\/myfamille\.shi-on\.net\/portal\/[^\s]+/g;

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of msg.matchAll(urlRegex)) {
    const url = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      parts.push(msg.slice(lastIndex, start));
    }

    let label = url;
    if (url.includes("/portal/kaipoke-info-detail/")) {
      label = "利用者情報";
    } else if (url.includes("/portal/shift-view")) {
      if (url.includes("client=")) {
        label = "訪問記録";
      } else {
        label = "シフト一覧";
      }
    }

    parts.push(
      <a
        key={`${url}-${start}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 underline"
      >
        {label}
      </a>,
    );

    lastIndex = start + url.length;
  }

  if (lastIndex < msg.length) {
    parts.push(msg.slice(lastIndex));
  }

  return parts;
}
