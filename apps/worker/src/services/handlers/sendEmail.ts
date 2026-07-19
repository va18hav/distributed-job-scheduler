import { Job } from "db";
import { logger } from "../../utils/logger.js";

export const handleSendEmail = async (job: Job): Promise<void> => {
    const payload = job.payload as { to?: string; body?: string };
    const to = payload.to || "default@example.com";

    logger.info({ jobId: job.id, to }, "[EmailHandler] Sending email...");
    
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate occasional random transient failures (e.g. 20% rate) to verify backoff and retry mechanism
    if (Math.random() < 0.2) {
        logger.warn({ jobId: job.id }, "[EmailHandler] Transient SMTP timeout simulated.");
        throw new Error("SMTP server response timeout (simulated).");
    }

    logger.info({ jobId: job.id, to }, "[EmailHandler] Email successfully sent.");
};
