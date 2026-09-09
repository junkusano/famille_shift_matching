import RecordingTranscriptsPage from "@/components/recording-transcripts/RecordingTranscriptsPage";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const rawSearchParams = (await searchParams) ?? {};
  const resolvedSearchParams = Object.fromEntries(
    Object.entries(rawSearchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return (
    <RecordingTranscriptsPage
      basePath="/cm-portal/recording-transcripts"
      portal="caremanager"
      searchParams={resolvedSearchParams}
    />
  );
}
