export const SHAREFULL_PUBLICATION_DEDUPE_STATUSES = [
  "pending",
  "claimed",
  "completed",
  "failed",
  "cancelled",
] as const;

type ExistingJob = {
  status: string;
  payload: Record<string, unknown> | null;
};

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function isDuplicateSharefullPublicationJob(
  existingJobs: ExistingJob[],
  operationKey: string,
  requestId: string,
): boolean {
  return existingJobs.some((job) =>
    text(job.payload?.operation_key) === operationKey
    || (["pending", "claimed"].includes(job.status)
      && text(job.payload?.spot_offer_request_id) === requestId),
  );
}
