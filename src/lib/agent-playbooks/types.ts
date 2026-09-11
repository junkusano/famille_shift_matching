export const AGENT_CATEGORIES = ["shift", "lineworks", "knowledge", "operations", "other"] as const;
export const AGENT_ROOM_SCOPES = ["client_room", "staff_room", "any_room"] as const;
export const AGENT_TRIGGER_MODES = ["lineworks_mention", "lineworks_phrase", "scheduled", "manual"] as const;
export const AGENT_EXECUTION_MODES = ["native_agent", "dialogflow_legacy", "scheduled_job"] as const;
export const AGENT_CONFIRMATION_MODES = ["none", "before_write", "always"] as const;
export const AGENT_APPROVER_SCOPES = ["requester_only", "requester_or_manager"] as const;
export const AGENT_ACTIONS = [
  "shift.list",
  "shift.create",
  "shift.delete",
  "lineworks.leave_self",
  "context.read_recent",
  "knowledge.draft_update",
  "lineworks.send_unhandled_reminder",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];
export type AgentRoomScope = (typeof AGENT_ROOM_SCOPES)[number];
export type AgentTriggerMode = (typeof AGENT_TRIGGER_MODES)[number];
export type AgentExecutionMode = (typeof AGENT_EXECUTION_MODES)[number];
export type AgentConfirmationMode = (typeof AGENT_CONFIRMATION_MODES)[number];
export type AgentApproverScope = (typeof AGENT_APPROVER_SCOPES)[number];
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export type AgentPlaybook = {
  id: string;
  name: string;
  description: string | null;
  category: AgentCategory;
  room_scope: AgentRoomScope;
  trigger_mode: AgentTriggerMode;
  execution_mode: AgentExecutionMode;
  situation: string;
  instructions: string;
  trigger_examples: string[];
  allowed_actions: AgentAction[];
  context_message_limit: number;
  context_minutes: number;
  confirmation_mode: AgentConfirmationMode;
  approver_scope: AgentApproverScope;
  session_ttl_minutes: number;
  is_enabled: boolean;
  is_locked: boolean;
  locked_reason: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AgentPlaybookInput = Pick<
  AgentPlaybook,
  | "name"
  | "description"
  | "category"
  | "room_scope"
  | "situation"
  | "instructions"
  | "trigger_examples"
  | "allowed_actions"
  | "context_message_limit"
  | "context_minutes"
  | "confirmation_mode"
  | "approver_scope"
  | "session_ttl_minutes"
  | "is_enabled"
>;
