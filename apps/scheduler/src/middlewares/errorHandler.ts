import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
    logger.error({ err }, 'Unhandled request error');
    
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
};
