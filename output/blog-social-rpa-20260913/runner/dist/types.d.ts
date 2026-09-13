export type RunnerStatus = 'idle' | 'busy' | 'stopping';
export interface RpaJob {
    id: string;
    job_type: string;
    payload: unknown;
    timeout_ms?: number;
    attempt?: number;
}
export interface ClaimJobResponse {
    ok: boolean;
    job: RpaJob | null;
}
export interface HeartbeatInput {
    status: 'online' | 'busy';
    currentJobId: string | null;
}
export interface JobFailure {
    errorCode: string;
    errorType: string;
    errorMessage: string;
    errorCategory?: string;
    retryCount?: number;
    debug: Record<string, unknown>;
}
export type JobResult = Record<string, unknown>;
//# sourceMappingURL=types.d.ts.map