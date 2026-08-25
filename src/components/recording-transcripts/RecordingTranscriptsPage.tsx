import { redirect } from "next/navigation";
import {
  getCurrentAuthUserId,
  getRecordingTranscriptsPageData,
  RecordingTranscriptAccessError,
  type RecordingTranscriptFilters,
  type RecordingTranscriptPortal,
} from "@/lib/recording-transcripts";
import RecordingTranscriptsPageClient from "./RecordingTranscriptsPageClient";

type SearchParams = {
  page?: string;
  perPage?: string;
  date_from?: string;
  date_to?: string;
  recorder_user_id?: string;
  client_name?: string;
  client_id?: string;
  context_name?: string;
  status?: string;
  keyword?: string;
};

type Props = {
  portal: RecordingTranscriptPortal;
  basePath: string;
  searchParams?: SearchParams;
};

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export default async function RecordingTranscriptsPage({ portal, basePath, searchParams }: Props) {
  const filters: RecordingTranscriptFilters = {
    dateFrom: text(searchParams?.date_from) || null,
    dateTo: text(searchParams?.date_to) || null,
    recorderUserId: text(searchParams?.recorder_user_id) || null,
    clientName: text(searchParams?.client_name) || null,
    clientId: text(searchParams?.client_id) || null,
    contextName: text(searchParams?.context_name) || null,
    status: text(searchParams?.status) || null,
    keyword: text(searchParams?.keyword) || null,
  };

  try {
    const authUserId = await getCurrentAuthUserId();
    const data = await getRecordingTranscriptsPageData(authUserId, portal, {
      ...filters,
      page: positiveInteger(searchParams?.page, 1),
      perPage: positiveInteger(searchParams?.perPage, 50),
    });

    return (
      <RecordingTranscriptsPageClient
        basePath={basePath}
        data={data}
        filters={filters}
        portal={portal}
      />
    );
  } catch (error) {
    if (error instanceof RecordingTranscriptAccessError) {
      redirect(error.status === 401 ? "/login" : "/unauthorized");
    }
    throw error;
  }
}
