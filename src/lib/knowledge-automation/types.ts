export const AUTOMATION_TASK_TYPES = [
  "weather_alert",
  "lineworks_knowledge",
  "lesson_reminder",
  "billing_review",
  "wordpress_blog",
  "knowledge_diff",
  "custom",
] as const;

export const AUTOMATION_TRIGGER_TYPES = ["interval", "daily", "weekly", "monthly", "event", "manual"] as const;

export const AUTOMATION_DESTINATIONS = [
  "lineworks_board",
  "lineworks_message",
  "kusano_knowledge",
  "lesson_reminder",
  "wordpress_post",
  "manager_notification",
  "none",
] as const;

export const AUTOMATION_APPROVAL_MODES = ["draft", "review_required", "automatic"] as const;

export type AutomationTaskType = (typeof AUTOMATION_TASK_TYPES)[number];
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];
export type AutomationDestination = (typeof AUTOMATION_DESTINATIONS)[number];
export type AutomationApprovalMode = (typeof AUTOMATION_APPROVAL_MODES)[number];

export type AutomationSchedule = {
  minutes?: number;
  times?: string[];
  dayOfWeek?: number;
  day?: number;
  time?: string;
  eventKey?: string;
};

export type KnowledgeAutomationTask = {
  id: string;
  name: string;
  description: string | null;
  task_type: AutomationTaskType;
  trigger_type: AutomationTriggerType;
  schedule: AutomationSchedule;
  destination: AutomationDestination;
  approval_mode: AutomationApprovalMode;
  condition_summary: string | null;
  settings: Record<string, unknown>;
  timezone: "Asia/Tokyo";
  privacy_filter_enabled: true;
  compliance_filter_enabled: true;
  safety_policy_version: string;
  is_enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_result: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeAutomationTaskInput = {
  name: string;
  description?: string;
  task_type: AutomationTaskType;
  trigger_type: AutomationTriggerType;
  schedule: AutomationSchedule;
  destination: AutomationDestination;
  approval_mode: AutomationApprovalMode;
  condition_summary?: string;
  settings?: Record<string, unknown>;
  is_enabled: boolean;
};
