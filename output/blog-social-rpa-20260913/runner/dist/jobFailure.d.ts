export type FailureClassification = {
    code: string;
    category: 'LOGIN_REQUIRED' | 'SMS_PROVIDER' | 'EXTENSION_BRIDGE' | 'PAGE_AUTOMATION' | 'TIMEOUT' | 'CONFIGURATION' | 'UNEXPECTED';
    retryable: boolean;
};
export declare function sanitizeFailureMessage(value: unknown): string;
export declare function classifyFailure(error: unknown): FailureClassification;
//# sourceMappingURL=jobFailure.d.ts.map