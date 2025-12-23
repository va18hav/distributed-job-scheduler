import { prisma, Job } from 'db'

export const acquireNextJob = async (workerId: string): Promise<Job | null> => {
    const jobs = await prisma.$queryRaw<Job[]>`
     WITH next_job AS(
        SELECT id
        FROM "Job"
        WHERE (status = 'PENDING' AND "availableAt" <= NOW())
         OR (status = 'RUNNING' AND "lockedAt" < NOW() - INTERVAL '30 seconds')
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
    RETURNING "Job".*;
    `
    if (jobs.length === 0) return null

    return jobs[0]
}

export const retryJob = async (id: string, workerId: string, availableAt: Date, lastError: string) => {
    return await prisma.job.updateMany({
        where: { id, lockedBy: workerId },
        data: {
            status: 'PENDING',
            availableAt,
            lockedAt: null,
            lockedBy: null,
            lastError
        }
    })
}

export const updateHeartbeat = async (jobId: string, workerId: string) => {
    await prisma.$executeRaw`
    UPDATE "Job"
    SET "lockedAt" = NOW()
    WHERE id = ${jobId}
      AND "lockedBy" = ${workerId}
      AND status = 'RUNNING'
    `
}

export const completedJob = async (id: string, workerId: string) => {
    return await prisma.job.updateMany({
        where: { id, lockedBy: workerId },
        data: {
            status: 'COMPLETED',
            lockedAt: null,
            lockedBy: null,
            lastError: null
        }
    })
}

export const failedJob = async (id: string, workerId: string, lastError: string) => {
    return await prisma.job.updateMany({
        where: { id, lockedBy: workerId },
        data: {
            status: 'FAILED',
            lockedAt: null,
            lockedBy: null,
            lastError
        }
    })
}

