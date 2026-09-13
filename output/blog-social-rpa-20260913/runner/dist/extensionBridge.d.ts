import type { ProgressOutbox } from './progress.js';
import type { JobResult, RpaJob } from './types.js';
export declare class ExtensionBridgeError extends Error {
    readonly code: string;
    constructor(message: string, code?: string);
}
export declare class ExtensionBridge {
    private readonly port;
    private readonly token;
    private readonly progress?;
    private readonly pending;
    private sequence;
    private server;
    constructor(port: number, token: string, progress?: ProgressOutbox | undefined);
    start(): Promise<void>;
    stop(): Promise<void>;
    execute(job: RpaJob, signal: AbortSignal): Promise<JobResult>;
    private authorized;
    private handle;
}
//# sourceMappingURL=extensionBridge.d.ts.map