type TemplateRow = {
  core_id?: unknown;
  kaipoke_cs_id?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Return one deterministic latest template for each client ID. */
export function latestSharefullTemplatesByClient<T extends TemplateRow>(rows: readonly T[]): T[] {
  const latestByClient = new Map<string, T>();

  for (const row of rows) {
    const clientId = text(row.kaipoke_cs_id);
    const coreId = text(row.core_id);
    if (!clientId || !coreId) continue;

    const current = latestByClient.get(clientId);
    if (!current) {
      latestByClient.set(clientId, row);
      continue;
    }

    const rowUpdated = timestamp(row.updated_at);
    const currentUpdated = timestamp(current.updated_at);
    const rowCreated = timestamp(row.created_at);
    const currentCreated = timestamp(current.created_at);
    const isNewer = rowUpdated > currentUpdated
      || (rowUpdated === currentUpdated && rowCreated > currentCreated)
      || (rowUpdated === currentUpdated && rowCreated === currentCreated && coreId > text(current.core_id));
    if (isNewer) latestByClient.set(clientId, row);
  }

  return [...latestByClient.values()].sort((a, b) => text(a.kaipoke_cs_id).localeCompare(text(b.kaipoke_cs_id)));
}
