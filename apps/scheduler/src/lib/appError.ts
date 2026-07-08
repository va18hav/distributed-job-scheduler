export class AppError extends Error {
    public statusCode: number
    public errors?: any[]

    constructor(statusCode: number, message: string, errors?: any[]) {
        super(message)
        this.statusCode = statusCode
        this.errors = errors
        // Set the prototype explicitly (needed for instanceof to work with TS)
        Object.setPrototypeOf(this, AppError.prototype)
    }
}