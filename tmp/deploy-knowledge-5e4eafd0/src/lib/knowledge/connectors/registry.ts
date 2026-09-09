import "server-only";

import type { KnowledgeConnector } from "@/lib/knowledge/types";
import { googleSheetsConnector } from "@/lib/knowledge/connectors/googleSheets";
import { faxConnector } from "@/lib/knowledge/connectors/fax";
import { githubConnector } from "@/lib/knowledge/connectors/github";
import { moneyForwardConnector } from "@/lib/knowledge/connectors/moneyforward";
import { googleAnalyticsConnector } from "@/lib/knowledge/connectors/googleAnalytics";
import { microsoftClarityConnector } from "@/lib/knowledge/connectors/microsoftClarity";

const connectors = new Map<string, KnowledgeConnector>([
  [googleSheetsConnector.key, googleSheetsConnector],
  [faxConnector.key, faxConnector],
  [githubConnector.key, githubConnector],
  [moneyForwardConnector.key, moneyForwardConnector],
  [googleAnalyticsConnector.key, googleAnalyticsConnector],
  [microsoftClarityConnector.key, microsoftClarityConnector],
]);

export function getKnowledgeConnector(key: string): KnowledgeConnector {
  const connector = connectors.get(key);
  if (!connector) {
    throw new Error(`未実装のconnectorです: ${key}`);
  }
  return connector;
}
