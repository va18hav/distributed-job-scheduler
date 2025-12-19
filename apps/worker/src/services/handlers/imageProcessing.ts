import { Job } from "db";
import { logger } from "../../utils/logger.js";

export const handleImageProcessing = async (job: Job): Promise<void> => {
    const payload = job.payload as { imageUrl?: string; targetWidth?: number; targetHeight?: number };
    const imageUrl = payload.imageUrl || "http://example.com/image.jpg";
    const width = payload.targetWidth || 800;
    const height = payload.targetHeight || 600;

    logger.info({ jobId: job.id, imageUrl, width, height }, "[ImageHandler] Processing/resizing image...");

    // Simulate standard latency for heavy CPU-bound job
    await new Promise((resolve) => setTimeout(resolve, 2500));

    logger.info({ jobId: job.id }, "[ImageHandler] Image successfully resized and uploaded.");
};
