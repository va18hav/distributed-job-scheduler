import { Job } from "db";

export const executeJob = async (job: Job): Promise<void> => {
    console.log(`Executing job ${job.id} of type ${job.type}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
};
