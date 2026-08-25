import RecordingTranscriptsPage from "@/components/recording-transcripts/RecordingTranscriptsPage";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams?: Record<string, string> }) {
  return (
    <RecordingTranscriptsPage
      basePath="/portal/recording-transcripts"
      portal="helper"
      searchParams={searchParams}
    />
  );
}
