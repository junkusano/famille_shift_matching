import { z } from "zod";
import {
  AGENT_ACTIONS,
  AGENT_APPROVER_SCOPES,
  AGENT_CATEGORIES,
  AGENT_CONFIRMATION_MODES,
  AGENT_ROOM_SCOPES,
} from "@/lib/agent-playbooks/types";

export const agentPlaybookInputSchema = z.object({
  name: z.string().trim().min(1, "ルール名を入力してください。").max(120),
  description: z.string().trim().max(500).nullable().optional().default(""),
  category: z.enum(AGENT_CATEGORIES),
  room_scope: z.enum(AGENT_ROOM_SCOPES),
  situation: z.string().trim().min(1, "どんな場面かを入力してください。").max(2_000),
  instructions: z.string().trim().min(1, "してほしいことを入力してください。").max(5_000),
  trigger_examples: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  allowed_actions: z.array(z.enum(AGENT_ACTIONS)).max(8).default([]),
  context_message_limit: z.number().int().min(0).max(50),
  context_minutes: z.number().int().min(0).max(180),
  confirmation_mode: z.enum(AGENT_CONFIRMATION_MODES),
  approver_scope: z.enum(AGENT_APPROVER_SCOPES),
  session_ttl_minutes: z.number().int().min(1).max(60),
  is_enabled: z.boolean(),
}).superRefine((value, context) => {
  if (value.allowed_actions.includes("shift.delete") && value.confirmation_mode === "none") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation_mode"], message: "シフト削除には実行前の確認が必要です。" });
  }
  if (value.context_message_limit === 0 && value.context_minutes > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["context_message_limit"], message: "会話を参照する場合は取得件数も指定してください。" });
  }
});
