import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import {
  getRecordingTranscriptDetail,
  requireRecordingTranscriptPortalAccess,
  type RecordingTranscriptDetail,
  type RecordingTranscriptParticipant,
  type RecordingTranscriptPortal,
} from "@/lib/recording-transcripts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TARGET_SERVICE_TYPES: Record<RecordingTranscriptPortal, readonly string[]> = {
  helper: ["houmon_kaigo", "both"],
  caremanager: ["kyotaku", "both"],
};

export type RecordingTranscriptUpdateInput = {
  clientId: string | null;
  clientName: string | null;
  contextId: string | null;
  contextName: string | null;
  participants: RecordingTranscriptParticipant[];
  transcriptRaw: string | null;
};

async function getAllowedRecorderIds(portal: RecordingTranscriptPortal): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .in("service_type", [...TARGET_SERVICE_TYPES[portal]])
    .not("auth_user_id", "is", null);

  if (error) throw new Error(`録音者の所属情報を取得できません: ${error.message}`);
  return (data ?? [])
    .map((row) => row.auth_user_id)
    .filter((value): value is string => typeof value === "string");
}

export async function updateRecordingTranscript(
  authUserId: string,
  portal: RecordingTranscriptPortal,
  id: string,
  input: RecordingTranscriptUpdateInput,
): Promise<RecordingTranscriptDetail | null> {
  await requireRecordingTranscriptPortalAccess(authUserId, portal);
  if (!UUID_RE.test(id)) return null;

  const recorderIds = await getAllowedRecorderIds(portal);
  if (recorderIds.length === 0) return null;

  const { data, error } = await supabaseAdmin
    .from("recording_transcripts")
    .update({
      client_id: input.clientId,
      client_name: input.clientName,
      context_id: input.contextId,
      context_name: input.contextName,
      participants: input.participants,
      transcript_raw: input.transcriptRaw,
    })
    .eq("id", id)
    .in("recorder_user_id", recorderIds)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`文字起こしを更新できません: ${error.message}`);
  if (!data) return null;
  return getRecordingTranscriptDetail(authUserId, portal, id);
}

export async function deleteRecordingTranscript(
  authUserId: string,
  portal: RecordingTranscriptPortal,
  id: string,
): Promise<boolean> {
  await requireRecordingTranscriptPortalAccess(authUserId, portal);
  if (!UUID_RE.test(id)) return false;

  const recorderIds = await getAllowedRecorderIds(portal);
  if (recorderIds.length === 0) return false;

  const { data, error } = await supabaseAdmin
    .from("recording_transcripts")
    .delete()
    .eq("id", id)
    .in("recorder_user_id", recorderIds)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`文字起こしを削除できません: ${error.message}`);
  return Boolean(data);
}
