import { JobTimeoutError } from './jobs/executeJob.js';
const SECRET = /(authorization\s*[:=]\s*(?:bearer\s+)?\S+|bearer\s+\S+|(?:rpa_|twilio[ _-]?(?:auth )?)(?:token|secret)\s*[:=]\s*\S+|cookie\s*[:=]\s*\S+)/gi;
export function sanitizeFailureMessage(value) {
    const message = value instanceof Error ? value.message : String(value);
    return message.replace(SECRET, '[redacted]').replace(/\+?\d[\d\s-]{8,}\d/g, '[redacted-phone]').slice(0, 500);
}
export function classifyFailure(error) {
    if (error instanceof JobTimeoutError)
        return { code: 'JOB_TIMEOUT', category: 'TIMEOUT', retryable: true };
    const message = sanitizeFailureMessage(error).toUpperCase();
    if (/SOCIAL_/.test(message))
        return { code: 'SOCIAL_SHARE_FAILED', category: 'PAGE_AUTOMATION', retryable: false };
    if (/(LOGIN_REQUIRED|AUTH_ERROR|SESSION_EXPIRED)/.test(message))
        return { code: 'LOGIN_REQUIRED', category: 'LOGIN_REQUIRED', retryable: false };
    if (/KAIPOKE_CLIENT_SYNC_FAILED/.test(message))
        return { code: 'PAGE_AUTOMATION_ERROR', category: 'PAGE_AUTOMATION', retryable: false };
    if (/(TWILIO|SMS_SEND_FAILED|SMS.*(?:REJECT|DENIED|AUTH|CREDIT|BILLING|ACCOUNT))/.test(message))
        return { code: 'SMS_PROVIDER_ERROR', category: 'SMS_PROVIDER', retryable: false };
    if (/(RPA_EXTENSION_TOKEN.*(?:NOT CONFIGURED|UNAVAILABLE)|INVALID (?:TAIMEE|KAIPOKE).*PAYLOAD|INVALID_PAYLOAD)/.test(message))
        return { code: 'RPA_CONFIGURATION_ERROR', category: 'CONFIGURATION', retryable: false };
    if (/(EXTENSION|127\.0\.0\.1|ECONNREFUSED|EPIPE|SOCKET)/.test(message))
        return { code: 'EXTENSION_BRIDGE_ERROR', category: 'EXTENSION_BRIDGE', retryable: true };
    if (/(TAIMEE_PAGE_NOT_READY|KAIPOKE_(?:PAGE|CLIENT|CERTIFICATE)|ELEMENT|SELECTOR|DOM|PAGE_NOT_READY)/.test(message))
        return { code: 'PAGE_AUTOMATION_ERROR', category: 'PAGE_AUTOMATION', retryable: true };
    return { code: 'JOB_EXECUTION_ERROR', category: 'UNEXPECTED', retryable: true };
}
//# sourceMappingURL=jobFailure.js.map