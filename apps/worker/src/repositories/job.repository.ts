import { prisma, Job } from 'db'

export const acquireNextJob = async (workerId: string): Promise<Job | null> => {
    const jobs = await prisma.$queryRaw<Job[]>`
     WITH next_job AS(
        SELECT id
        FROM "Job"
        WHERE status = 'PENDING' AND "availableAt" <= NOW()
        ORDER BY "priority" DESC, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE "Job"
     SET
        status = 'RUNNING',
        "lockedBy" = ${workerId},
        "lockedAt" = NOW(),
        "attempts" = attempts + 1
    FROM next_job
    WHERE "Job".id = next_job.id
    RETURNING *;
    `
    if (jobs.length === 0) return null

    return jobs[0]
}
