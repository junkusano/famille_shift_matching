import { z } from "zod";
import {
  AUTOMATION_APPROVAL_MODES,
  AUTOMATION_DESTINATIONS,
  AUTOMATION_TASK_TYPES,
  AUTOMATION_TRIGGER_TYPES,
} from "@/lib/knowledge-automation/types";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const knowledgeAutomationTaskInputSchema = z.object({
  name: z.string().trim().min(1, "タスク名を入力してください。").max(120),
  description: z.string().trim().max(500).optional().default(""),
  task_type: z.enum(AUTOMATION_TASK_TYPES),
  trigger_type: z.enum(AUTOMATION_TRIGGER_TYPES),
  schedule: z.object({
    minutes: z.number().int().min(5).max(1_440).optional(),
    times: z.array(z.string().regex(timePattern)).max(12).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    day: z.number().int().min(1).max(31).optional(),
    time: z.string().regex(timePattern).optional(),
    eventKey: z.string().trim().max(100).optional(),
  }).default({}),
  destination: z.enum(AUTOMATION_DESTINATIONS),
  approval_mode: z.enum(AUTOMATION_APPROVAL_MODES),
  condition_summary: z.string().trim().max(2_000).optional().default(""),
  settings: z.record(z.unknown()).optional().default({}),
  is_enabled: z.boolean(),
}).superRefine((value, context) => {
  if (value.settings.operation === "recruitment_analytics" && (value.destination !== "none" || value.task_type !== "custom")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "応募導線分析は「その他の自動化」「保存のみ」で登録してください。" });
  }
  const publicNotice = value.task_type === "weather_alert" || ["traffic_restrictions", "police_enforcement"].includes(String(value.settings.operation));
  if (publicNotice && value.is_enabled && value.destination === "lineworks_board" && !/^\d+$/.test(String(value.settings.lineworksBoardId ?? ""))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["settings", "lineworksBoardId"], message: "配信先の掲示板IDを入力してください。" });
  }
  if (value.settings.operation === "traffic_restrictions" && value.destination !== "lineworks_board") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "交通規制はLINE WORKS掲示板を選んでください。" });
  }
  if (value.settings.operation === "police_enforcement" && (value.destination !== "lineworks_message" || !String(value.settings.lineworksChannelId ?? "").trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "取締情報の通知先グループを設定してください。" });
  }
  if (value.settings.operation === "system_diagnostics" && (value.destination !== "none" || value.task_type !== "custom")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "システム診断は「その他の自動化」「保存のみ」で登録してください。" });
  }
  if (value.trigger_type === "interval" && value.schedule.minutes === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "minutes"], message: "確認間隔を選んでください。" });
  }
  if (value.trigger_type === "daily" && !value.schedule.times?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "times"], message: "実行時刻を入力してください。" });
  }
  if (value.trigger_type === "weekly" && (value.schedule.dayOfWeek === undefined || !value.schedule.time)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "毎週の曜日と実行時刻を入力してください。" });
  }
  if (value.trigger_type === "monthly" && (value.schedule.day === undefined || !value.schedule.time)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "毎月の実行日と時刻を入力してください。" });
  }
});
