import { acquireNextJob, completedJob, failedJob, retryJob, updateHeartbeat } from "./repositories/job.repository.js";
import { executeJob } from "./services/execution.service.js";

const heartbeatInterval = +(process.env.HEARTBEAT_INTERVAL || '5000');
const maxRetries = +(process.env.MAX_RETRIES || '3');

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const startWorker = async () => {
    const workerId = crypto.randomUUID();
    console.log("Worker started:", workerId);

    while (true) {
        const job = await acquireNextJob(workerId);

        if (!job) {
            await sleep(1000);
            continue;
        }

        const heartbeat = setInterval(() => {
            updateHeartbeat(job.id).catch(console.error);
        }, heartbeatInterval);

        try {
            await executeJob(job);
            await completedJob(job.id);
        } catch (err) {
            if (job.attempts <= maxRetries) {
                const backOffDelays = [5, 20, 80, 240];
                const delayInSeconds = backOffDelays[job.attempts - 1] ?? 240;
                const nextAvailableAt = new Date(Date.now() + delayInSeconds * 1000);
                await retryJob(job.id, nextAvailableAt);
            } else {
                await failedJob(job.id);
            }
        } finally {
            clearInterval(heartbeat);
        }
    }
};
