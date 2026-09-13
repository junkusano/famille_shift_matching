import type { ExtensionBridge } from '../../extensionBridge.js';
import type { JobResult } from '../../types.js';
export declare function createKaipokeClientSyncHandler(bridge: ExtensionBridge | undefined): (payload: unknown, signal: AbortSignal, job?: import('../../types.js').RpaJob) => Promise<JobResult>;
//# sourceMappingURL=kaipokeClientSync.d.ts.map