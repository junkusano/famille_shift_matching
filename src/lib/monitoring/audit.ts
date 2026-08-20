import "server-only";

import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { MonitoringActor } from "./auth";

export type MonitoringEventAction =
  | "create"
  | "ai_generate"
  | "ai_regenerate"
  | "edit"
  | "confirm"
  | "pdf_create"
  | "fax_send"
  | "fax_resend"
  | "delete";

export async function recordMonitoringEvent(params: {
  monitoringId: string;
  action: MonitoringEventAction;
  actor: MonitoringActor;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { monitoringId, action, actor, metadata = {} } = params;
  const { error } = await supabaseAdmin.from("client_monitoring_events").insert({
    monitoring_id: monitoringId,
    action,
    actor_user_id: actor.userId,
    actor_name: actor.name,
    metadata,
  });
  if (error) console.error("[monitoring:audit] event insert failed", error);

  await recordOperationLog({
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: `monitoring.${action.replaceAll("_", "-")}`,
    category: "monitoring",
    description: `モニタリング操作: ${action}`,
    resourceType: "client_monitoring",
    resourceId: monitoringId,
    metadata,
  });
}
