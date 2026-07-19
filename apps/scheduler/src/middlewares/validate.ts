import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

export const validate = (schema: z.ZodObject<any, any>) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const parsed = await schema.parseAsync(req.body);
            req.body = parsed;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: error.issues.map((err) => ({
                        field: err.path.join("."),
                        message: err.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
};
