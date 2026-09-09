// =============================================================
// src/lib/cm/home/getHomeSummary.ts
// ホーム画面用サマリー取得（Server Action）
//
// 本システムが管理しているデータのみ集計する。
// kaipoke_user_id があるユーザーは担当利用者に絞り込む。
// kaipoke_user_id がないユーザー（管理者等）は全件表示。
//
// 担当判定:
//   users.user_id → users.kaipoke_user_id
//   → cm_kaipoke_support_office.care_manager_kaipoke_id
//   → kaipoke_cs_id リスト
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import {
  requireCmSession,
  CmAuthError,
} from "@/lib/cm/auth/requireCmSession";

const logger = createLogger("lib/cm/home/getHomeSummary");

// =============================================================
// Types
// =============================================================

/** 署名待ち契約（ホーム表示用） */
export type CmHomeContractItem = {
  id: string;
  kaipoke_cs_id: string;
  client_name: string | null;
  status: string;
  document_count: number;
  created_at: string;
};

/** 未処理Plaud（ホーム表示用） */
export type CmHomePlaudItem = {
  id: number;
  title: string;
  kaipoke_cs_id: string | null;
  client_name: string | null;
  status: string;
  plaud_created_at: string;
};

/** 直近アクティビティ（ホーム表示用） */
export type CmHomeActivityItem = {
  type: "contract" | "plaud" | "alert";
  action: string;
  detail: string;
  time: string;
  status: "success" | "warning" | "neutral" | "critical";
};

/** ホーム画面サマリーデータ */
export type CmHomeSummary = {
  /** 担当利用者数（is_active = true） */
  totalClients: number;
  /** 署名待ち契約数（status = 'signing'） */
  signingContracts: number;
  /** 未処理Plaud件数（status = 'pending'） */
  pendingPlaud: number;
  /** 今月の契約完了数 */
  contractsCompletedThisMonth: number;
  /** 今月のPlaud処理済数 */
  plaudProcessedThisMonth: number;
  /** 下書き契約数 */
  draftContracts: number;
  /** 署名待ち契約リスト（最新5件） */
  signingContractList: CmHomeContractItem[];
  /** 未処理Plaudリスト（最新5件） */
  pendingPlaudList: CmHomePlaudItem[];
  /** 直近アクティビティ（最新10件） */
  recentActivity: CmHomeActivityItem[];
};

export type GetHomeSummaryResult =
  | { ok: true; summary: CmHomeSummary }
  | { ok: false; error: string };

// =============================================================
// ヘルパー: 相対時刻表示
// =============================================================

function cmFormatRelativeTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = now.getTime() - target.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay}日前`;
  return target.toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

// =============================================================
// ヘルパー: ログインユーザーの担当利用者IDリストを取得
//
// 戻り値:
//   null       → kaipoke_user_id なし（担当を特定できない → 全件表示）
//   string[]   → 担当利用者IDリスト
// =============================================================

async function cmGetAssignedClientIds(
  userId: string
): Promise<string[] | null> {
  // users テーブルから kaipoke_user_id を取得
  const { data: userData, error: userError } = await supabaseAdmin
    .from("users")
    .select("kaipoke_user_id")
    .eq("user_id", userId)
    .single();

  if (userError || !userData) {
    logger.warn("ユーザー情報取得失敗", {
      userId,
      error: userError?.message,
    });
    // 取得失敗時はフィルタなし（全件表示）
    return null;
  }

  // kaipoke_user_id がない → 担当を特定できない → 全件表示
  if (!userData.kaipoke_user_id) {
    logger.info("kaipoke_user_id なし — フィルタなしで全件表示", { userId });
    return null;
  }

  const kaipokeUserId = userData.kaipoke_user_id;

  // cm_kaipoke_support_office から担当利用者の kaipoke_cs_id を取得
  const { data: supportData, error: supportError } = await supabaseAdmin
    .from("cm_kaipoke_support_office")
    .select("kaipoke_cs_id")
    .eq("care_manager_kaipoke_id", kaipokeUserId);

  if (supportError) {
    logger.warn("担当利用者取得失敗", {
      kaipokeUserId,
      error: supportError.message,
    });
    // 取得失敗時はフィルタなし（全件表示）
    return null;
  }

  // 重複排除
  const csIds = [
    ...new Set((supportData ?? []).map((d) => d.kaipoke_cs_id)),
  ];

  logger.info("担当利用者ID取得", {
    kaipokeUserId,
    count: csIds.length,
  });

  return csIds;
}

// =============================================================
// ヘルパー: クエリに担当フィルタを適用
//
// assignedCsIds が null の場合（担当特定不可）はフィルタしない
// =============================================================

function cmApplyClientFilter<T extends { in: (col: string, vals: string[]) => T }>(
  query: T,
  assignedCsIds: string[] | null,
  column = "kaipoke_cs_id"
): T {
  if (assignedCsIds === null) return query;
  return query.in(column, assignedCsIds);
}

// =============================================================
// サマリー取得
// =============================================================

export async function getHomeSummary(
  token: string
): Promise<GetHomeSummaryResult> {
  try {
    // 認証チェック
    const auth = await requireCmSession(token);
    logger.info("ホームサマリー取得開始", { userId: auth.userId });

    // 担当利用者IDリストを取得（null = 担当特定不可 → フィルタなし）
    const assignedCsIds = await cmGetAssignedClientIds(auth.userId);

    // kaipoke_user_id はあるが担当利用者が0人の場合は空のサマリーを返す
    if (assignedCsIds !== null && assignedCsIds.length === 0) {
      logger.info("担当利用者0人 — 空のサマリーを返す");
      return {
        ok: true,
        summary: {
          totalClients: 0,
          signingContracts: 0,
          draftContracts: 0,
          pendingPlaud: 0,
          contractsCompletedThisMonth: 0,
          plaudProcessedThisMonth: 0,
          signingContractList: [],
          pendingPlaudList: [],
          recentActivity: [],
        },
      };
    }

    // 今月の1日（UTC）
    const now = new Date();
    const firstOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    // ---------------------------------------------------------
    // 並列で全クエリを実行
    // assignedCsIds が null（担当特定不可）の場合はフィルタなし
    // ---------------------------------------------------------

    // クエリビルダー: 共通の担当フィルタを適用
    const clientCountQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_kaipoke_info")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      assignedCsIds
    );

    const signingCountQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_contracts")
        .select("*", { count: "exact", head: true })
        .eq("status", "signing"),
      assignedCsIds
    );

    const draftCountQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_contracts")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft"),
      assignedCsIds
    );

    // Plaud系は registered_by（登録者）でフィルタ
    // ※ Plaud管理画面と同じフィルタロジック
    const pendingPlaudQ = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("registered_by", auth.userId);

    const completedContractsQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_contracts")
        .select("*", { count: "exact", head: true })
        .in("status", ["signed", "completed"])
        .gte("signed_at", firstOfMonth),
      assignedCsIds
    );

    const processedPlaudQ = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*", { count: "exact", head: true })
      .in("status", ["approved", "completed"])
      .gte("updated_at", firstOfMonth)
      .eq("registered_by", auth.userId);

    const signingListQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_contracts")
        .select("id, kaipoke_cs_id, status, created_at")
        .eq("status", "signing")
        .order("created_at", { ascending: false })
        .limit(5),
      assignedCsIds
    );

    const plaudListQ = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("id, title, kaipoke_cs_id, status, plaud_created_at")
      .eq("status", "pending")
      .eq("registered_by", auth.userId)
      .order("plaud_created_at", { ascending: false })
      .limit(5);

    const recentContractsQ = cmApplyClientFilter(
      supabaseAdmin
        .from("cm_contracts")
        .select("id, kaipoke_cs_id, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5),
      assignedCsIds
    );

    const recentPlaudQ = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("id, title, kaipoke_cs_id, status, updated_at")
      .eq("registered_by", auth.userId)
      .order("updated_at", { ascending: false })
      .limit(5);

    const [
      clientsResult,
      signingCountResult,
      draftCountResult,
      pendingPlaudResult,
      completedContractsResult,
      processedPlaudResult,
      signingListResult,
      plaudListResult,
      recentContractsResult,
      recentPlaudResult,
    ] = await Promise.all([
      clientCountQ,
      signingCountQ,
      draftCountQ,
      pendingPlaudQ,
      completedContractsQ,
      processedPlaudQ,
      signingListQ,
      plaudListQ,
      recentContractsQ,
      recentPlaudQ,
    ]);

    // エラーチェック（カウント系）
    if (clientsResult.error) {
      logger.error("利用者数取得エラー", clientsResult.error);
      return { ok: false, error: "利用者数の取得に失敗しました" };
    }

    // ---------------------------------------------------------
    // 利用者名を一括取得
    // ---------------------------------------------------------
    const csIds = new Set<string>();

    for (const c of signingListResult.data ?? []) {
      if (c.kaipoke_cs_id) csIds.add(c.kaipoke_cs_id);
    }
    for (const p of plaudListResult.data ?? []) {
      if (p.kaipoke_cs_id) csIds.add(p.kaipoke_cs_id);
    }
    for (const c of recentContractsResult.data ?? []) {
      if (c.kaipoke_cs_id) csIds.add(c.kaipoke_cs_id);
    }
    for (const p of recentPlaudResult.data ?? []) {
      if (p.kaipoke_cs_id) csIds.add(p.kaipoke_cs_id);
    }

    const clientNameMap = new Map<string, string>();
    if (csIds.size > 0) {
      const { data: clientsData } = await supabaseAdmin
        .from("cm_kaipoke_info")
        .select("kaipoke_cs_id, name")
        .in("kaipoke_cs_id", Array.from(csIds));

      for (const c of clientsData ?? []) {
        clientNameMap.set(c.kaipoke_cs_id, c.name);
      }
    }

    // ---------------------------------------------------------
    // 書類数を一括取得（署名待ち契約用）
    // ---------------------------------------------------------
    const contractIds = (signingListResult.data ?? []).map((c) => c.id);
    const docCountMap = new Map<string, number>();
    if (contractIds.length > 0) {
      const { data: docsData } = await supabaseAdmin
        .from("cm_contract_documents")
        .select("contract_id")
        .in("contract_id", contractIds);

      for (const d of docsData ?? []) {
        docCountMap.set(
          d.contract_id,
          (docCountMap.get(d.contract_id) ?? 0) + 1
        );
      }
    }

    // ---------------------------------------------------------
    // 署名待ち契約リストを構築
    // ---------------------------------------------------------
    const signingContractList: CmHomeContractItem[] = (
      signingListResult.data ?? []
    ).map((c) => ({
      id: c.id,
      kaipoke_cs_id: c.kaipoke_cs_id,
      client_name: clientNameMap.get(c.kaipoke_cs_id) ?? null,
      status: c.status,
      document_count: docCountMap.get(c.id) ?? 0,
      created_at: c.created_at,
    }));

    // ---------------------------------------------------------
    // 未処理Plaudリストを構築
    // ---------------------------------------------------------
    const pendingPlaudList: CmHomePlaudItem[] = (
      plaudListResult.data ?? []
    ).map((p) => ({
      id: p.id,
      title: p.title,
      kaipoke_cs_id: p.kaipoke_cs_id,
      client_name: p.kaipoke_cs_id
        ? clientNameMap.get(p.kaipoke_cs_id) ?? null
        : null,
      status: p.status,
      plaud_created_at: p.plaud_created_at,
    }));

    // ---------------------------------------------------------
    // 直近アクティビティを構築（契約 + Plaud を時系列マージ）
    // ---------------------------------------------------------
    const contractStatusLabels: Record<
      string,
      { action: string; status: CmHomeActivityItem["status"] }
    > = {
      signing: { action: "契約書送信", status: "warning" },
      signed: { action: "契約署名完了", status: "success" },
      completed: { action: "契約完了処理", status: "success" },
      draft: { action: "契約下書き作成", status: "neutral" },
    };

    const plaudStatusLabels: Record<
      string,
      { action: string; status: CmHomeActivityItem["status"] }
    > = {
      pending: { action: "Plaud登録", status: "neutral" },
      approved: { action: "文字起こし承認", status: "success" },
      completed: { action: "文字起こし完了", status: "success" },
      failed: { action: "文字起こし失敗", status: "critical" },
    };

    const activityItems: (CmHomeActivityItem & { sortTime: string })[] = [];

    for (const c of recentContractsResult.data ?? []) {
      const label = contractStatusLabels[c.status] ?? {
        action: "契約更新",
        status: "neutral" as const,
      };
      const name = clientNameMap.get(c.kaipoke_cs_id) ?? "不明";
      activityItems.push({
        type: "contract",
        action: label.action,
        detail: name,
        time: cmFormatRelativeTime(c.updated_at),
        status: label.status,
        sortTime: c.updated_at,
      });
    }

    for (const p of recentPlaudResult.data ?? []) {
      const label = plaudStatusLabels[p.status] ?? {
        action: "Plaud更新",
        status: "neutral" as const,
      };
      const name = p.kaipoke_cs_id
        ? clientNameMap.get(p.kaipoke_cs_id) ?? p.title
        : p.title;
      activityItems.push({
        type: "plaud",
        action: label.action,
        detail: name,
        time: cmFormatRelativeTime(p.updated_at),
        status: label.status,
        sortTime: p.updated_at,
      });
    }

    // 時系列でソートして最新10件
    activityItems.sort((a, b) => b.sortTime.localeCompare(a.sortTime));
    const recentActivity: CmHomeActivityItem[] = activityItems
      .slice(0, 10)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ sortTime: _sortTime, ...rest }) => rest);

    // ---------------------------------------------------------
    // サマリー構築
    // ---------------------------------------------------------
    const summary: CmHomeSummary = {
      totalClients: clientsResult.count ?? 0,
      signingContracts: signingCountResult.count ?? 0,
      draftContracts: draftCountResult.count ?? 0,
      pendingPlaud: pendingPlaudResult.count ?? 0,
      contractsCompletedThisMonth: completedContractsResult.count ?? 0,
      plaudProcessedThisMonth: processedPlaudResult.count ?? 0,
      signingContractList,
      pendingPlaudList,
      recentActivity,
    };

    logger.info("ホームサマリー取得成功", {
      totalClients: summary.totalClients,
      signingContracts: summary.signingContracts,
      pendingPlaud: summary.pendingPlaud,
      isAdmin: assignedCsIds === null,
    });

    return { ok: true, summary };
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}