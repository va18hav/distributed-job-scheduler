import { prisma } from 'db'
import { CreateJob } from '../types/job.types.js'

export const createJob = async (data: CreateJob) => {
    return await prisma.job.create({
        data,
        select: {
            id: true,
            type: true,
            status: true
        }
    })
}

export const getJobById = async (id: string) => {
    return await prisma.job.findUnique({
        where: { id }
    })
}

export const getAllJobs = async (options?: { limit?: number; offset?: number }) => {
    const take = options?.limit ?? 50
    const skip = options?.offset ?? 0

    return await prisma.job.findMany({
        take,
        skip,
        orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' }
        ]
    })
}

export const getAllPendingJobs = async () => {
    return await prisma.job.findMany({
        where: {
            status: 'PENDING'
        },
        orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' }
        ]
    })
}

export const getPendingJob = async () => {
    return await prisma.job.findFirst({
        where: {
            status: 'PENDING'
        }
    })
}

export const getSystemStats = async () => {
    const counts = await prisma.job.groupBy({
        by: ['status'],
        _count: { id: true }
    })

    const activeWorkers = await prisma.job.groupBy({
        by: ['lockedBy'],
        where: {
            status: 'RUNNING',
            lockedAt: {
                gte: new Date(Date.now() - 30 * 1000)
            }
        },
        _count: { id: true }
    })

    const activeWorkersCount = activeWorkers.filter(w => w.lockedBy !== null).length

    const queueDepth = counts.reduce((acc, curr) => {
        acc[curr.status] = curr._count.id
        return acc
    }, {} as Record<string, number>)

    return {
        queueDepth,
        activeWorkersCount
    }
}