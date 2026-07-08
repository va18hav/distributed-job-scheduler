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

export const getAllJobs = async () => {
    return await prisma.job.findMany()
}

export const getAllPendingJobs = async () => {
    return await prisma.job.findMany({
        where: {
            status: 'PENDING'
        }
    })
}

export const getPendingJob = async () => {
    return await prisma.job.findFirst({
        where: {
            status: 'PENDING'
        }
    })
}