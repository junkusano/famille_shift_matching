import type { AgentAction, AgentPlaybookInput } from "@/lib/agent-playbooks/types";
import type {
  AgentApproverScope,
  AgentCategory,
  AgentConfirmationMode,
  AgentExecutionMode,
  AgentRoomScope,
  AgentTriggerMode,
} from "@/lib/agent-playbooks/types";

export const CATEGORY_LABELS: Record<AgentCategory, string> = {
  shift: "シフト",
  lineworks: "LINE WORKS操作",
  knowledge: "手順書・ナレッジ",
  operations: "定時・業務確認",
  other: "その他",
};

export const ROOM_SCOPE_LABELS: Record<AgentRoomScope, string> = {
  client_room: "利用者様の部屋",
  staff_room: "職員の部屋",
  any_room: "すべての部屋",
};

export const TRIGGER_MODE_LABELS: Record<AgentTriggerMode, string> = {
  lineworks_mention: "@すまーとアイさん で開始",
  lineworks_phrase: "決まった言葉で開始",
  scheduled: "定時実行",
  manual: "管理画面から手動実行",
};

export const EXECUTION_MODE_LABELS: Record<AgentExecutionMode, string> = {
  native_agent: "新しいスマートアイ",
  dialogflow_legacy: "Dialogflow（退出専用）",
  scheduled_job: "既存の定時処理",
};

export const CONFIRMATION_MODE_LABELS: Record<AgentConfirmationMode, string> = {
  none: "確認なし（読み取りのみ）",
  before_write: "変更・送信の直前に確認",
  always: "必ず確認",
};

export const APPROVER_SCOPE_LABELS: Record<AgentApproverScope, string> = {
  requester_only: "依頼した本人のみ",
  requester_or_manager: "依頼者またはマネジャー",
};

export const ACTION_LABELS: Record<AgentAction, string> = {
  "shift.list": "シフトを検索・列記",
  "shift.create": "シフトを追加",
  "shift.delete": "シフトを削除",
  "lineworks.leave_self": "依頼者本人を部屋から退出",
  "context.read_recent": "直前の会話を参照",
  "knowledge.draft_update": "手順書の追記案を作成",
  "lineworks.send_unhandled_reminder": "未対応リマインドを送信",
};

export const EMPTY_PLAYBOOK: AgentPlaybookInput = {
  name: "",
  description: "",
  category: "other",
  room_scope: "any_room",
  situation: "",
  instructions: "",
  trigger_examples: [],
  allowed_actions: [],
  context_message_limit: 0,
  context_minutes: 0,
  confirmation_mode: "before_write",
  approver_scope: "requester_only",
  session_ttl_minutes: 10,
  is_enabled: false,
};

export const PLAYBOOK_TEMPLATES: Array<{ key: string; label: string; summary: string; input: AgentPlaybookInput }> = [
  {
    key: "shift-create",
    label: "シフト追加",
    summary: "日付・時間・担当者・サービスを特定し、確認後にシフトを追加します。",
    input: {
      name: "利用者様のシフト追加",
      description: "利用者様の部屋で、必要項目を確認し、安全にシフトを追加します。",
      category: "shift",
      room_scope: "client_room",
      situation: "cs_kaipoke_idが特定できる利用者様の部屋で、@すまーとアイさんへのメンション付きでシフトの追加・登録を依頼されたとき",
      instructions: "対象日、開始・終了時刻、担当者、サービスコードを特定する。対象日は必ず依頼内容から確認し、日付が不明なら聞き返す。時刻・担当者・サービスコードが不足している場合は、同じ利用者様の直前のシフト（同じ曜日を優先）を参考に候補を提案し、推測した項目だと明示する。登録内容を列記して依頼者へ確認し、依頼者がOKと答えた場合だけ、重複を再確認してシフトを追加する。追加後は結果を知らせる。",
      trigger_examples: ["9月20日のシフトを追加してください", "10月3日に前回と同じ内容でシフトを入れて"],
      allowed_actions: ["context.read_recent", "shift.list", "shift.create"],
      context_message_limit: 10,
      context_minutes: 30,
      confirmation_mode: "always",
      approver_scope: "requester_only",
      session_ttl_minutes: 7,
      is_enabled: false,
    },
  },
  {
    key: "shift-cancel",
    label: "シフトキャンセル・削除",
    summary: "対象シフトを列記し、日時を特定して確認後に削除します。",
    input: {
      name: "利用者様のシフトキャンセル",
      description: "利用者様の部屋で、キャンセル対象を安全に特定して削除します。",
      category: "shift",
      room_scope: "client_room",
      situation: "cs_kaipoke_idが特定できる利用者様の部屋で、シフトのキャンセル・中止・削除を依頼されたとき",
      instructions: "対象期間のシフトを列記する。日付と開始時刻が一意になるまで聞き返す。削除対象の日時・サービスを表示して確認し、依頼者がOKと答えた場合だけ削除する。削除後は結果を知らせる。",
      trigger_examples: ["来週火曜日のシフトがキャンセルになりました", "9月8日の夕方のシフトを削除して"],
      allowed_actions: ["shift.list", "shift.delete"],
      context_message_limit: 10,
      context_minutes: 30,
      confirmation_mode: "always",
      approver_scope: "requester_only",
      session_ttl_minutes: 10,
      is_enabled: false,
    },
  },
  {
    key: "handbook",
    label: "今の議論を手順書に追加",
    summary: "直前の会話を整理し、手順書へ追加する文章案を作ります。",
    input: {
      name: "今の議論を手順書に追加・清書",
      description: "メンション前の会話を限定的に参照し、決定事項を手順書案にします。",
      category: "knowledge",
      room_scope: "any_room",
      situation: "議論のあとで、今の内容を手順書に追加・清書してほしいと依頼されたとき",
      instructions: "直前の会話から決定事項、手順、注意点、未決事項を分ける。推測で補わず、追記案を先に表示する。追加先が不明なら確認する。承認後に手順書の追記案として保存する。",
      trigger_examples: ["今の議論のところ、手順書に追加して清書して", "ここまでの内容を手順にまとめて"],
      allowed_actions: ["context.read_recent", "knowledge.draft_update"],
      context_message_limit: 30,
      context_minutes: 60,
      confirmation_mode: "before_write",
      approver_scope: "requester_or_manager",
      session_ttl_minutes: 20,
      is_enabled: false,
    },
  },
];
