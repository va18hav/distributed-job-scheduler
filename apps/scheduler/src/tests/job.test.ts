import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('db', () => {
    return {
        prisma: {
            job: {
                create: jest.fn(),
                findMany: jest.fn(),
                findUnique: jest.fn(),
                groupBy: jest.fn(),
            }
        }
    };
});

let app: any;
let prisma: any;

beforeAll(async () => {
    const appModule = await import('../app.js');
    app = appModule.default;
    
    const dbModule = await import('db');
    prisma = dbModule.prisma;
});

describe('Job Scheduler API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /job', () => {
        it('should return 400 when type is missing', async () => {
            const res = await request(app)
                .post('/job')
                .send({
                    payload: { foo: 'bar' }
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Validation failed');
            expect(res.body.errors[0].field).toBe('type');
        });

        it('should return 400 when priority is not an integer', async () => {
            const res = await request(app)
                .post('/job')
                .send({
                    type: 'send_email',
                    priority: 'high'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors[0].field).toBe('priority');
        });

        it('should create a job and return 201 when payload is valid', async () => {
            const mockJob = {
                id: 'job-id-123',
                type: 'send_email',
                status: 'PENDING'
            };
            prisma.job.create.mockResolvedValue(mockJob);

            const res = await request(app)
                .post('/job')
                .send({
                    type: 'send_email',
                    payload: { to: 'test@example.com' },
                    priority: 5
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual(mockJob);
        });
    });
});
