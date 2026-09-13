import type { ProgressOutbox } from './progress.js';
import type { MyFamilleClient } from './api/myFamilleClient.js';
import type { RunnerConfig } from './config.js';
import { type JobHandler } from './jobs/executeJob.js';
import type { Logger } from './logger.js';
export declare class Runner {
    private readonly config;
    private readonly client;
    private readonly logger;
    private readonly handlers;
    private readonly progress?;
    private status;
    private currentJobId;
    private heartbeatTimer;
    private started;
    constructor(config: RunnerConfig, client: MyFamilleClient, logger: Logger, handlers?: Readonly<Record<string, JobHandler>>, progress?: ProgressOutbox | undefined);
    start(): Promise<void>;
    stop(): Promise<void>;
    private startHeartbeat;
    private sendHeartbeat;
    private runLoop;
    private processJob;
    private executeWithRetries;
    private errorMessage;
    private isStopping;
}
//# sourceMappingURL=runner.d.ts.map