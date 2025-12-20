import { z } from 'zod';

export const CreateJobSchema = z.object({
    type: z.string().min(1, 'type is required'),
    payload: z.any().default({}),
    priority: z.number().int().optional().default(0),
    availableAt: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
});

export type CreateJob = z.infer<typeof CreateJobSchema>;