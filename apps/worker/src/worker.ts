import { acquireNextJob, completedJob, failedJob, retryJob, updateHeartbeat } from "./repositories/job.repository";
import { executeJob } from "./services/execution.service";
import { prisma } from 'db'



let isShuttingDown = false
const heartbeatInterval = +(process.env.HEARTBEAT_INTERVAL || '5000')
const maxRetries = +(process.env.MAX_RETRIES || '3')

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const startWorker = async () => {
    const workerId = crypto.randomUUID()
    console.log(`Worker:${workerId} started`)

    process.on("SIGINT", () => {
        isShuttingDown = true
    })
    process.on("SIGTERM", () => {
        isShuttingDown = true
    })

    while (true) {
        if (isShuttingDown) {
            break
        }

        try {
            const job = await acquireNextJob(workerId);

            if (!job) {
                console.log('There are no pending jobs currently')
                await sleep(1000);
                continue;
            }

            const heartbeat = setInterval(() => {
                updateHeartbeat(job.id).catch((err) => {
                    console.error(`[Worker:${workerId}] Heartbeat update failed for job ${job.id}:`, err);
                });
            }, heartbeatInterval)

            try {
                await executeJob(job);
                await completedJob(job.id);
                console.log(`The job: ${job.id} is completed by worker:${workerId}`)
            } catch (err) {
                if (job.attempts <= maxRetries) {
                    const backOffDelays = [5, 20, 80, 240]
                    const delayInSeconds = backOffDelays[job.attempts - 1] ?? 240
                    const nextAvailableAt = new Date(Date.now() + delayInSeconds * 1000)
                    await retryJob(job.id, nextAvailableAt)
                    console.log(`Job ${job.id} will be retried in ${delayInSeconds}s (at ${nextAvailableAt.toISOString()})`)
                } else {
                    await failedJob(job.id);
                    console.log(`Job ${job.id} failed permanently after reaching max retries (${job.attempts}/${maxRetries})`)
                }
            } finally {
                clearInterval(heartbeat)
            }
        } catch (pollErr) {
            console.error(`[Worker:${workerId}] Error in task poll/acquisition loop:`, pollErr);
            // Sleep for 2 seconds before retrying to prevent hot loop on connection errors
            await sleep(2000);
        }
    }
    console.log(`Worker:${workerId} is shutting down gracefully...`)
    await prisma.$disconnect()
    process.exit(0)
}