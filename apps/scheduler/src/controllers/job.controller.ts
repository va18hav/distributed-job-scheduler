import { Request, Response, NextFunction } from "express";
import { CreateJob } from "../types/job.types.js";
import * as jobService from '../services/job.service.js'

export const createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { type, payload, priority, availableAt }: CreateJob = req.body;
        const result = await jobService.createJob({ 
            type, 
            payload, 
            priority, 
            availableAt 
        });
        res.status(201).json({
            success: true,
            message: 'Job has been created successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getAllPendingJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await jobService.getAllPendingJobs();
        res.status(200).json({
            success: true,
            message: result && result.length > 0 ? 'Job fetched successfully' : 'There are no pending jobs',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getAllJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const limit = req.query.limit ? Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 100) : 50;
        const offset = req.query.offset ? Math.max(parseInt(String(req.query.offset), 10) || 0, 0) : 0;
        const result = await jobService.getAllJobs({ limit, offset });
        res.status(200).json({
            success: true,
            message: result && result.length > 0 ? 'Job fetched successfully' : 'There are no jobs',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getJobById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = String(req.params.id);
        const result = await jobService.getJobById(id);
        res.status(200).json({
            success: true,
            message: 'Job fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getSystemStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await jobService.getSystemStats();
        res.status(200).json({
            success: true,
            message: 'System stats fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};