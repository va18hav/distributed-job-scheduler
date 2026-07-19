import { Job } from "db";
import { handleSendEmail } from "./handlers/sendEmail.js";
import { handleImageProcessing } from "./handlers/imageProcessing.js";
import { logger } from "../utils/logger.js";

type JobHandler = (job: Job) => Promise<void>;

const jobRegistry: Record<string, JobHandler> = {
    "send_email": handleSendEmail,
    "image_processing": handleImageProcessing,
};

export const executeJob = async (job: Job): Promise<void> => {
    logger.info({ jobId: job.id, jobType: job.type }, "Starting task execution");
    const handler = jobRegistry[job.type];
    
    if (!handler) {
        throw new Error(`No registered execution handler found for job type: ${job.type}`);
    }
    
    await handler(job);
};
