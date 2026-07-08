import { CreateJob } from "../types/job.types.js";
import * as jobDb from '../repositories/job.respository.js'

export const createJob = async (data: CreateJob) => {
    return await jobDb.createJob(data)
}

export const getPendingJob = async () => {
    return await jobDb.getPendingJob()
}

export const getAllPendingJobs = async () => {
    return await jobDb.getAllPendingJobs()
}

export const getAllJobs = async () => {
    return await jobDb.getAllJobs()
}