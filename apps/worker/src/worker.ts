import { acquireNextJob, completedJob, failedJob, retryJob, updateHeartbeat } from "./repositories/job.repository.js";
import { executeJob } from "./services/execution.service.js";
import { prisma } from 'db';
import { logger } from './utils/logger.js';

let isShuttingDown = false;
const defaultHeartbeatInterval = +(process.env.HEARTBEAT_INTERVAL || '5000');
const defaultMaxRetries = +(process.env.MAX_RETRIES || '3');
export const BACKOFF_DELAYS_SECONDS = [5, 20, 80, 240];

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const processNextJob = async (
    workerId: string,
    options: { heartbeatInterval?: number; maxRetries?: number } = {}
): Promise<boolean> => {
    const heartbeatInterval = options.heartbeatInterval ?? defaultHeartbeatInterval;
    const maxRetries = options.maxRetries ?? defaultMaxRetries;

    const job = await acquireNextJob(workerId);

    if (!job) {
        logger.debug({ workerId }, "No pending jobs found in database queue");
        return false;
    }

    logger.info({ workerId, jobId: job.id, jobType: job.type, attempt: job.attempts }, "Acquired job lock");

    const heartbeat = setInterval(() => {
        updateHeartbeat(job.id, workerId).catch((err) => {
            logger.error({ workerId, jobId: job.id, err }, "Heartbeat update transaction failed");
        });
    }, heartbeatInterval);

    try {
        await executeJob(job);
        await completedJob(job.id, workerId);
        logger.info({ workerId, jobId: job.id, jobType: job.type }, "Job successfully completed");
    } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (job.attempts <= maxRetries) {
            const delayInSeconds = BACKOFF_DELAYS_SECONDS[job.attempts - 1] ?? 240;
            const nextAvailableAt = new Date(Date.now() + delayInSeconds * 1000);
            await retryJob(job.id, workerId, nextAvailableAt, errorMessage);
            logger.warn(
                { workerId, jobId: job.id, attempt: job.attempts, maxRetries, delayInSeconds, nextAvailableAt, err: errorMessage },
                "Job execution failed, scheduled retry"
            );
        } else {
            await failedJob(job.id, workerId, errorMessage);
            logger.error(
                { workerId, jobId: job.id, attempt: job.attempts, maxRetries, err: errorMessage },
                "Job failed permanently, reached maximum retry limit"
            );
        }
    } finally {
        clearInterval(heartbeat);
    }

    return true;
};

export const startWorker = async () => {
    const workerId = crypto.randomUUID();
    logger.info({ workerId }, "Worker process started");

    process.on("SIGINT", () => {
        logger.info({ workerId }, "SIGINT received. Starting graceful shutdown sequence");
        isShuttingDown = true;
    });
    process.on("SIGTERM", () => {
        logger.info({ workerId }, "SIGTERM received. Starting graceful shutdown sequence");
        isShuttingDown = true;
    });

    while (!isShuttingDown) {
        try {
            const processed = await processNextJob(workerId);
            if (!processed) {
                await sleep(1000);
            }
        } catch (pollErr) {
            logger.error({ workerId, err: pollErr }, "Exception encountered in worker poll/acquisition loop");
            // Sleep for 2 seconds to avoid hot looping if database connection drops
            await sleep(2000);
        }
    }

    logger.info({ workerId }, "Worker loop terminated. Cleaning up database connections");
    await prisma.$disconnect();
    logger.info({ workerId }, "Database disconnected. Process exiting");
    process.exit(0);
};