import type { RunnerConfig } from '../config.js';
import type { ClaimJobResponse, HeartbeatInput, JobFailure, JobResult } from '../types.js';
type FetchLike = typeof fetch;
export declare class ApiRequestError extends Error {
    readonly status: number;
    constructor(status: number, path: string);
}
export declare class MyFamilleClient {
    private readonly config;
    private readonly fetchFn;
    constructor(config: RunnerConfig, fetchFn?: FetchLike);
    sendProgress(events: import('../progressEvent.js').ProgressEvent[]): Promise<void>;
    sendHeartbeat(input: HeartbeatInput): Promise<void>;
    claimJob(): Promise<ClaimJobResponse>;
    completeJob(jobId: string, result: JobResult): Promise<void>;
    failJob(jobId: string, failure: JobFailure): Promise<void>;
    private request;
}
export {};
//# sourceMappingURL=myFamilleClient.d.ts.map