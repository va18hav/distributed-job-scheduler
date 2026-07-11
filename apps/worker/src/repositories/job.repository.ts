import { JsonValue } from '@prisma/client/runtime/client'
import { prisma } from 'db'
import { Job } from 'db/src/generated/prisma/client'

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
    RETURNING *;
    `
    if (jobs.length === 0) return null

    return jobs[0]
}

export const retryJob = async (id: string, availableAt: Date) => {
    return await prisma.job.update({
        where: { id },
        data: {
            status: 'PENDING',
            availableAt,
            lockedAt: null,
            lockedBy: null
        }
    })
}

export const updateHeartbeat = async (jobId: string) => {
    await prisma.$queryRaw<Job[]>`
    UPDATE "Job"
    SET "lockedAt" = NOW()
    WHERE id = ${jobId}
    `
}

export const completedJob = async (id: string) => {
    return await prisma.job.update({
        where: { id },
        data: {
            status: 'COMPLETED'
        }
    })
}

export const failedJob = async (id: string) => {
    return await prisma.job.update({
        where: { id },
        data: {
            status: 'FAILED'
        }
    })
}

