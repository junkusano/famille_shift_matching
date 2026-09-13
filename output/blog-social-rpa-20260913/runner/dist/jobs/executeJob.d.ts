import type { JobResult, RpaJob } from '../types.js';
import type { ExtensionBridge } from '../extensionBridge.js';
export type JobHandler = (payload: unknown, signal: AbortSignal, job?: RpaJob) => Promise<JobResult>;
export declare const jobHandlers: Readonly<Record<string, JobHandler>>;
export declare function createJobHandlers(bridge: ExtensionBridge | undefined): Readonly<Record<string, JobHandler>>;
export declare class UnknownJobTypeError extends Error {
    constructor(jobType: string);
}
export declare class JobTimeoutError extends Error {
    constructor(timeoutMs: number);
}
export declare function executeJob(job: RpaJob, signal: AbortSignal, handlers?: Readonly<Record<string, JobHandler>>): Promise<JobResult>;
export declare function executeJobWithTimeout(job: RpaJob, timeoutMs: number, handlers?: Readonly<Record<string, JobHandler>>): Promise<JobResult>;
//# sourceMappingURL=executeJob.d.ts.map