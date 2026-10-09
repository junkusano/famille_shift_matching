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

/** Return every active-scope template with usable identity fields in deterministic order. */
export function activeSharefullTemplates<T extends TemplateRow>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => text(row.kaipoke_cs_id) && text(row.core_id))
    .slice()
    .sort((a, b) => {
      const clientOrder = text(a.kaipoke_cs_id).localeCompare(text(b.kaipoke_cs_id));
      if (clientOrder !== 0) return clientOrder;

      const updatedA = timestamp(a.updated_at);
      const updatedB = timestamp(b.updated_at);
      if (updatedA !== updatedB) return updatedB > updatedA ? 1 : -1;

      const createdA = timestamp(a.created_at);
      const createdB = timestamp(b.created_at);
      if (createdA !== createdB) return createdB > createdA ? 1 : -1;

      return text(b.core_id).localeCompare(text(a.core_id));
    });
}
