import "server-only";

import { createHash } from "crypto";
import type { ConnectorContext, ConnectorResult, KnowledgeConnector } from "@/lib/knowledge/types";
import { getMoneyForwardTenant } from "@/lib/moneyforward/client";
import { getMoneyForwardAccessToken } from "@/lib/moneyforward/tokens";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readTenant(ctx: ConnectorContext) {
  if (!ctx.source.integration_id) throw new Error("Money Forwardを先に接続してください。");
  const accessToken = await getMoneyForwardAccessToken(ctx.source.integration_id);
  return getMoneyForwardTenant(accessToken);
}

export const moneyForwardConnector: KnowledgeConnector = {
  key: "moneyforward",

  async testConnection(ctx) {
    const tenant = await readTenant(ctx);
    return {
      ok: true,
      details: { accountId: tenant.accountId, accountName: tenant.accountName },
    };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const tenant = await readTenant(ctx);
    const fetchedAt = new Date().toISOString();
    const contentHash = hash({ accountId: tenant.accountId, accountName: tenant.accountName, metadata: tenant.metadata });
    const unchanged = ctx.cursor.tenantHash === contentHash;

    return {
      objects: unchanged ? [] : [{
        externalId: `tenant:${tenant.accountId}`,
        objectType: "moneyforward_tenant",
        sourceRevision: contentHash,
        title: `Money Forward: ${tenant.accountName}`,
        safeExcerpt: "Money Forwardクラウド会計の接続先情報",
        occurredAt: fetchedAt,
        contentHash,
        locator: { provider: "moneyforward", accountId: tenant.accountId },
        metadata: { accountName: tenant.accountName, ...tenant.metadata },
        privacyLevel: 2,
        publishability: "internal_only",
        containsPersonalData: false,
      }],
      proposedKnowledge: [],
      nextCursor: {
        tenantId: tenant.accountId,
        tenantHash: contentHash,
        lastFetchedAt: fetchedAt,
      },
      hasMore: false,
      warnings: ["現段階は接続先確認のみです。仕訳・残高・キャッシュ管理の同期は次段階で追加します。"],
    };
  },
};
