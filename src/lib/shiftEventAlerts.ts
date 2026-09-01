export type ShiftEventAlert = {
  id: string;
  template_id: string;
  event_name: string;
  memo: string | null;
  user_id: string | null;
  kaipoke_cs_id: string;
  due_date: string;
};

export type ShiftAlertTextToken =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function normalizeShiftEventAlerts(value: unknown): ShiftEventAlert[] {
  if (!Array.isArray(value)) return [];

  const alerts: ShiftEventAlert[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;

    const id = asString(row.id);
    const templateId = asString(row.template_id);
    const eventName = asString(row.event_name);
    const userId = asString(row.user_id) || null;
    const kaipokeCsId = asString(row.kaipoke_cs_id);
    const dueDate = asString(row.due_date);
    if (!id || !templateId || !eventName || !kaipokeCsId || !dueDate) {
      continue;
    }

    const key = id;
    if (seen.has(key)) continue;
    seen.add(key);

    alerts.push({
      id,
      template_id: templateId,
      event_name: eventName,
      memo: typeof row.memo === "string" ? row.memo : null,
      user_id: userId,
      kaipoke_cs_id: kaipokeCsId,
      due_date: dueDate,
    });
  }

  return alerts;
}

export function buildEventTaskHref(
  alert: Pick<ShiftEventAlert, "id" | "kaipoke_cs_id" | "user_id">,
) {
  const params = new URLSearchParams({
    id: alert.id,
    client_id: alert.kaipoke_cs_id,
  });
  if (alert.user_id) params.set("user_id", alert.user_id);
  return `/portal/event-tasks?${params.toString()}`;
}

export function tokenizeShiftAlertText(value: string): ShiftAlertTextToken[] {
  const tokens: ShiftAlertTextToken[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/giu;
  let cursor = 0;

  for (const match of value.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: "text", value: value.slice(cursor, index) });

    const matched = match[0];
    const trailing = matched.match(/[),.;!?、。）」』】]+$/u)?.[0] ?? "";
    const href = trailing ? matched.slice(0, -trailing.length) : matched;

    try {
      const parsed = new URL(href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        tokens.push({ kind: "url", value: href, href });
      } else {
        tokens.push({ kind: "text", value: href });
      }
    } catch {
      tokens.push({ kind: "text", value: href });
    }

    if (trailing) tokens.push({ kind: "text", value: trailing });
    cursor = index + matched.length;
  }

  if (cursor < value.length) tokens.push({ kind: "text", value: value.slice(cursor) });
  return tokens.length ? tokens : [{ kind: "text", value }];
}
