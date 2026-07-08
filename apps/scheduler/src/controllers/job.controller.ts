import { Request, Response } from "express";
import { CreateJob } from "../types/job.types.js";
import * as jobService from '../services/job.service.js'

export const createJob = async (req: Request, res: Response) => {
    const { type, payload }: CreateJob = req.body
    const result = await jobService.createJob({ type, payload })
    res.status(201).json({
        success: true,
        message: 'Job has been created successfully',
        data: result
    })
}


export const getAllPendingJobs = async (req: Request, res: Response) => {
    const result = await jobService.getAllPendingJobs()
    res.status(200).json({
        success: true,
        message: result ? 'Job fetched successfully' : 'There are no pending jobs',
        data: result
    })
}

export const getAllJobs = async (req: Request, res: Response) => {
    const result = await jobService.getAllJobs()
    res.status(200).json({
        success: true,
        message: result ? 'Job fetched successfully' : 'There are no jobs',
        data: result
    })
}