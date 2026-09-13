import type { JobResult } from '../../types.js';
export declare class InvalidJobPayloadError extends Error {
    constructor(message: string);
}
export declare function testSleep(payload: unknown, signal: AbortSignal): Promise<JobResult>;
//# sourceMappingURL=testSleep.d.ts.map