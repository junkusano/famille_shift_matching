import { createSocialShareBlogHandler } from './handlers/socialShareBlog.js';
import { createSharefullCloseSpotOfferHandler } from './handlers/sharefullCloseSpotOffer.js';
import { testSleep } from './handlers/testSleep.js';
import { createTaimeeDailyWorkerFollowSmsHandler } from './handlers/taimeeDailyWorkerFollowSms.js';
import { createKaipokeClientSyncHandler } from './handlers/kaipokeClientSync.js';
import { createSharefullCreateSpotOfferHandler } from './handlers/sharefullCreateSpotOffer.js';
import { createSharefullCreateTemplateHandler } from './handlers/sharefullCreateTemplate.js';
export const jobHandlers = { 'test.sleep': testSleep };
export function createJobHandlers(bridge) {
    return {
        ...jobHandlers,
        'social.share_blog': createSocialShareBlogHandler(bridge),
        'taimee.daily_worker_follow_sms': createTaimeeDailyWorkerFollowSmsHandler(bridge),
        'kaipoke.client_sync': createKaipokeClientSyncHandler(bridge),
        'sharefull.close_spot_offer': createSharefullCloseSpotOfferHandler(bridge),
        'sharefull.create_spot_offer': createSharefullCreateSpotOfferHandler(bridge),
        'sharefull.create_template': createSharefullCreateTemplateHandler(bridge),
    };
}
export class UnknownJobTypeError extends Error {
    constructor(jobType) { super(`No handler registered for job type: ${jobType}`); this.name = 'UnknownJobTypeError'; }
}
export class JobTimeoutError extends Error {
    constructor(timeoutMs) { super(`Job exceeded timeout of ${timeoutMs}ms`); this.name = 'JobTimeoutError'; }
}
export async function executeJob(job, signal, handlers = jobHandlers) {
    const handler = handlers[job.job_type];
    if (!handler)
        throw new UnknownJobTypeError(job.job_type);
    return handler(job.payload, signal, job);
}
export async function executeJobWithTimeout(job, timeoutMs, handlers = jobHandlers) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => { const error = new JobTimeoutError(timeoutMs); controller.abort(error); reject(error); }, timeoutMs);
    });
    try {
        return await Promise.race([executeJob(job, controller.signal, handlers), timeout]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=executeJob.js.map