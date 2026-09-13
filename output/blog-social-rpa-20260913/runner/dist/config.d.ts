export interface RunnerConfig {
    apiBaseUrl: string;
    runnerId: string;
    runnerName: string;
    runnerToken: string;
    heartbeatIntervalMs: number;
    jobPollIntervalMs: number;
    defaultJobTimeoutMs: number;
    runnerVersion: string;
    extensionPort: number;
    extensionToken: string | null;
}
type Environment = NodeJS.ProcessEnv;
export declare function loadConfig(env?: Environment, loadDotenv?: boolean): RunnerConfig;
export {};
//# sourceMappingURL=config.d.ts.map