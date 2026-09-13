import dotenv from 'dotenv';
const REQUIRED_KEYS = ['MYFAMILLE_API_BASE_URL', 'RPA_RUNNER_ID', 'RPA_RUNNER_NAME', 'RPA_RUNNER_TOKEN'];
function required(env, key) {
    const value = env[key]?.trim();
    if (!value)
        throw new Error(`Missing required environment variable: ${key}`);
    return value;
}
function parsePositiveInteger(value, fallback, key) {
    if (value === undefined || value.trim() === '')
        return fallback;
    if (!/^\d+$/.test(value))
        throw new Error(`${key} must be a positive integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0)
        throw new Error(`${key} must be a positive integer`);
    return parsed;
}
export function loadConfig(env = process.env, loadDotenv = true) {
    if (loadDotenv)
        dotenv.config({ quiet: true });
    for (const key of REQUIRED_KEYS)
        required(env, key);
    const apiBaseUrl = required(env, 'MYFAMILLE_API_BASE_URL');
    try {
        new URL(apiBaseUrl);
    }
    catch {
        throw new Error('MYFAMILLE_API_BASE_URL must be a valid URL');
    }
    return {
        apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
        runnerId: required(env, 'RPA_RUNNER_ID'),
        runnerName: required(env, 'RPA_RUNNER_NAME'),
        runnerToken: required(env, 'RPA_RUNNER_TOKEN'),
        heartbeatIntervalMs: parsePositiveInteger(env.HEARTBEAT_INTERVAL_MS, 30_000, 'HEARTBEAT_INTERVAL_MS'),
        jobPollIntervalMs: parsePositiveInteger(env.JOB_POLL_INTERVAL_MS, 5_000, 'JOB_POLL_INTERVAL_MS'),
        defaultJobTimeoutMs: parsePositiveInteger(env.DEFAULT_JOB_TIMEOUT_MS, 300_000, 'DEFAULT_JOB_TIMEOUT_MS'),
        runnerVersion: env.npm_package_version?.trim() || '0.1.3',
        extensionPort: parsePositiveInteger(env.RPA_EXTENSION_PORT, 43_123, 'RPA_EXTENSION_PORT'),
        extensionToken: env.RPA_EXTENSION_TOKEN?.trim() || null,
    };
}
//# sourceMappingURL=config.js.map