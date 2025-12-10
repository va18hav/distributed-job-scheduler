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
