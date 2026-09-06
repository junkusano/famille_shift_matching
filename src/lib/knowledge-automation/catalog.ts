import type {
  AutomationApprovalMode,
  AutomationDestination,
  AutomationTaskType,
  AutomationTriggerType,
  KnowledgeAutomationTaskInput,
} from "@/lib/knowledge-automation/types";

export const TASK_TYPE_LABELS: Record<AutomationTaskType, string> = {
  weather_alert: "台風・大雪などの気象情報",
  lineworks_knowledge: "LINE WORKSから草野ナレッジ",
  lesson_reminder: "再発防止策から教訓リマインド",
  billing_review: "請求管理表の定期レビュー",
  wordpress_blog: "WordPressブログ記事作成",
  custom: "その他の自動化",
};

export const TRIGGER_TYPE_LABELS: Record<AutomationTriggerType, string> = {
  interval: "一定間隔で確認",
  daily: "毎日決まった時刻",
  monthly: "毎月決まった日",
  event: "新しい情報を受け取ったとき",
  manual: "必要なときだけ手動実行",
};

export const DESTINATION_LABELS: Record<AutomationDestination, string> = {
  lineworks_board: "LINE WORKS掲示板",
  lineworks_message: "LINE WORKSメッセージ",
  kusano_knowledge: "草野ナレッジ",
  lesson_reminder: "教訓リマインド",
  wordpress_post: "WordPressブログ",
  manager_notification: "担当マネジャーへの通知",
  none: "保存のみ（通知なし）",
};

export const APPROVAL_MODE_LABELS: Record<AutomationApprovalMode, string> = {
  draft: "下書きまで",
  review_required: "人の確認後に実行",
  automatic: "条件一致で自動実行",
};

export type AutomationTemplate = {
  key: string;
  label: string;
  summary: string;
  input: KnowledgeAutomationTaskInput;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "weather",
    label: "台風・大雪のお知らせ",
    summary: "サービスエリアへの影響を確認し、LINE WORKS掲示板の文案を作ります。",
    input: {
      name: "台風・大雪のお知らせ",
      description: "気象の一次情報とファミーユのサービスエリアを照合します。",
      task_type: "weather_alert",
      trigger_type: "interval",
      schedule: { minutes: 15 },
      destination: "lineworks_board",
      approval_mode: "review_required",
      condition_summary: "愛知県などのサービスエリアに台風・大雪の影響が見込まれる場合",
      settings: {},
      is_enabled: false,
    },
  },
  {
    key: "kusano",
    label: "草野ナレッジへの追加",
    summary: "草野さんのLINE WORKS発信を、根拠付きのナレッジ候補にします。",
    input: {
      name: "LINE WORKSから草野ナレッジ",
      description: "対象メッセージを要約し、重複を確認してナレッジ候補にします。",
      task_type: "lineworks_knowledge",
      trigger_type: "event",
      schedule: { eventKey: "lineworks_message" },
      destination: "kusano_knowledge",
      approval_mode: "review_required",
      condition_summary: "草野さんの発信で「#草野ナレッジ」が付いている、または重要な考え方と判定された場合",
      settings: {},
      is_enabled: false,
    },
  },
  {
    key: "lesson",
    label: "教訓リマインドへの追加",
    summary: "再発防止策を整理し、個人情報を除いて教訓候補にします。",
    input: {
      name: "再発防止策から教訓リマインド",
      description: "原因・対策・担当・期限・効果確認日を整理します。",
      task_type: "lesson_reminder",
      trigger_type: "event",
      schedule: { eventKey: "lineworks_message" },
      destination: "lesson_reminder",
      approval_mode: "review_required",
      condition_summary: "「#教訓」または「#再発防止」が付いた発信を受け取った場合",
      settings: {},
      is_enabled: false,
    },
  },
  {
    key: "billing",
    label: "毎月の請求レビュー",
    summary: "毎月15日に請求管理表を確認し、異常候補だけをマネジャーへ知らせます。",
    input: {
      name: "請求管理表の毎月レビュー",
      description: "未入力・未請求・前月差・利用実績との不一致候補を確認します。",
      task_type: "billing_review",
      trigger_type: "monthly",
      schedule: { day: 15, time: "09:00" },
      destination: "manager_notification",
      approval_mode: "automatic",
      condition_summary: "未入力、未請求、金額の大幅変動、利用実績との不一致候補がある場合",
      settings: {},
      is_enabled: false,
    },
  },
  {
    key: "blog",
    label: "ブログ記事の自動下書き",
    summary: "草野ナレッジを最優先し、1日3回WordPressに下書きを作ります。",
    input: {
      name: "ブログ記事を1日3回作成",
      description: "草野ナレッジ、社内情報、RSSの順に根拠を確認して記事を作ります。",
      task_type: "wordpress_blog",
      trigger_type: "daily",
      schedule: { times: ["08:00", "13:00", "18:00"] },
      destination: "wordpress_post",
      approval_mode: "draft",
      condition_summary: "公開可能で承認済みの根拠があり、過去記事と重複しない場合",
      settings: {},
      is_enabled: false,
    },
  },
];
