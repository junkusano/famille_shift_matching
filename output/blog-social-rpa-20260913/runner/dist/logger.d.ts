export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export declare class ConsoleLogger implements Logger {
    private log;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
//# sourceMappingURL=logger.d.ts.map