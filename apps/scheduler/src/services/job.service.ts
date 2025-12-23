import { CreateJob } from "../types/job.types.js";
import * as jobDb from '../repositories/job.repository.js'
import { AppError } from '../lib/appError.js'

export const createJob = async (data: CreateJob) => {
    return await jobDb.createJob(data)
}

export const getJobById = async (id: string) => {
    const job = await jobDb.getJobById(id)
    if (!job) {
        throw new AppError(404, `Job with id ${id} not found`)
    }
    return job
}

export const getPendingJob = async () => {
    return await jobDb.getPendingJob()
}

export const getAllPendingJobs = async () => {
    return await jobDb.getAllPendingJobs()
}

export const getAllJobs = async (options?: { limit?: number; offset?: number }) => {
    return await jobDb.getAllJobs(options)
}

export const getSystemStats = async () => {
    return await jobDb.getSystemStats()
}