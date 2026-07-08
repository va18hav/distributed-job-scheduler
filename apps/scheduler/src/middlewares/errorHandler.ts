import { Request, Response } from 'express'
import { AppError } from '../lib/appError.js'

export const errorHandler = (err: Error, req: Request, res: Response) => {
    // 1.Custom application errors
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...(err.errors && { errors: err.errors }),
        })
        return
    }

    // 2. Unexpected errors (bugs, DB connection failures, etc.)
    console.error("Unhandled error:", err)
    res.status(500).json({ message: "Internal server error" })
}
