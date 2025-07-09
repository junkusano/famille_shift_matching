export type MsgLwLog = {
  id: number;
  timestamp: string; // ISO 8601形式（例: "2025-07-03T10:00:00Z"）
  event_type?: string | null;
  user_id: string;
  channel_id?: string | null; // LINE WORKSのroomId相当
  domain_id?: string | null;
  message: string;
  file_id: string;
  members: Record<string, unknown>; // jsonb: 汎用性を保つため
  status: '未判定' | '未対応' | '対応済み';
};
