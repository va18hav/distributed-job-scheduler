import { Job } from "db/src/generated/prisma/client"

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const executeJob = async (job: Job) => {
    console.log(`Executing job ${job.id} (${job.type})`);
    await new Promise((resolve) => setTimeout(resolve, 3000))
}
