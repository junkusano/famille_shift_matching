import { type ProgressEvent, type EventCode } from './progressEvent.js';
export declare class ProgressOutbox {
    private path;
    private send;
    private version;
    private tail;
    private flushing;
    constructor(path: string, send: (events: ProgressEvent[]) => Promise<void>, version: string);
    private serial;
    private read;
    private write;
    append(input: unknown): Promise<void>;
    record(jobId: string, attempt: number, code: EventCode, data?: ProgressEvent['data']): Promise<void>;
    flush(): Promise<void>;
}
//# sourceMappingURL=progress.d.ts.map