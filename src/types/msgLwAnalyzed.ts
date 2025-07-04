export type AnalyzedResult = {
  id?: number;
  timestamp: string;
  channel_id: string;
  text: string;
  reason: string;
  analyzed_at?: string;
};