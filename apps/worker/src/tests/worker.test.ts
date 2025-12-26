import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

const mockAcquireNextJob = jest.fn<any>();
const mockCompletedJob = jest.fn<any>();
const mockRetryJob = jest.fn<any>();
const mockFailedJob = jest.fn<any>();
const mockUpdateHeartbeat = jest.fn<any>();
const mockExecuteJob = jest.fn<any>();

jest.unstable_mockModule('db', () => ({
    prisma: {
        $disconnect: jest.fn(),
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        job: {
            updateMany: jest.fn(),
        },
    },
}));

jest.unstable_mockModule('../repositories/job.repository.js', () => ({
    acquireNextJob: mockAcquireNextJob,
    completedJob: mockCompletedJob,
    retryJob: mockRetryJob,
    failedJob: mockFailedJob,
    updateHeartbeat: mockUpdateHeartbeat,
}));

jest.unstable_mockModule('../services/execution.service.js', () => ({
    executeJob: mockExecuteJob,
}));

let processNextJob: (workerId: string, options?: { heartbeatInterval?: number; maxRetries?: number }) => Promise<boolean>;

beforeAll(async () => {
    const workerModule = await import('../worker.js');
    processNextJob = workerModule.processNextJob;
});

describe('Worker Job Lifecycle (processNextJob)', () => {
    const workerId = 'worker-test-uuid';

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateHeartbeat.mockResolvedValue(undefined);
    });

    it('should return false when no pending jobs are available in queue', async () => {
        mockAcquireNextJob.mockResolvedValue(null);

        const processed = await processNextJob(workerId);

        expect(processed).toBe(false);
        expect(mockAcquireNextJob).toHaveBeenCalledWith(workerId);
        expect(mockExecuteJob).not.toHaveBeenCalled();
    });

    it('should execute job and mark it COMPLETED with worker fencing when handler succeeds', async () => {
        const fakeJob = {
            id: 'job-101',
            type: 'image_processing',
            payload: { imageUrl: 'https://example.com/pic.png' },
            status: 'RUNNING',
            attempts: 1,
            priority: 5,
            lockedBy: workerId,
        };
        mockAcquireNextJob.mockResolvedValue(fakeJob);
        mockExecuteJob.mockResolvedValue(undefined);
        mockCompletedJob.mockResolvedValue({ count: 1 });

        const processed = await processNextJob(workerId);

        expect(processed).toBe(true);
        expect(mockExecuteJob).toHaveBeenCalledWith(fakeJob);
        expect(mockCompletedJob).toHaveBeenCalledWith('job-101', workerId);
        expect(mockRetryJob).not.toHaveBeenCalled();
        expect(mockFailedJob).not.toHaveBeenCalled();
    });

    it('should schedule a retry with exponential backoff and record lastError when attempts <= maxRetries', async () => {
        const fakeJob = {
            id: 'job-202',
            type: 'send_email',
            payload: { to: 'user@example.com' },
            status: 'RUNNING',
            attempts: 2, // 2nd attempt -> 20s backoff
            priority: 1,
            lockedBy: workerId,
        };
        mockAcquireNextJob.mockResolvedValue(fakeJob);
        mockExecuteJob.mockRejectedValue(new Error('SMTP timeout'));
        mockRetryJob.mockResolvedValue({ count: 1 });

        const before = Date.now();
        const processed = await processNextJob(workerId, { maxRetries: 3 });

        expect(processed).toBe(true);
        expect(mockRetryJob).toHaveBeenCalledTimes(1);

        const [jobIdArg, workerIdArg, nextAvailableAtArg, errorMsgArg] = mockRetryJob.mock.calls[0];
        expect(jobIdArg).toBe('job-202');
        expect(workerIdArg).toBe(workerId);
        expect(errorMsgArg).toBe('SMTP timeout');
        // 2nd attempt backoff is 20 seconds
        const scheduledDelayMs = (nextAvailableAtArg as Date).getTime() - before;
        expect(scheduledDelayMs).toBeGreaterThanOrEqual(19000);
        expect(scheduledDelayMs).toBeLessThanOrEqual(22000);
        expect(mockFailedJob).not.toHaveBeenCalled();
    });

    it('should mark job as permanently FAILED when attempts exceed maxRetries', async () => {
        const fakeJob = {
            id: 'job-303',
            type: 'send_email',
            payload: { to: 'user@example.com' },
            status: 'RUNNING',
            attempts: 4, // Exceeds maxRetries: 3
            priority: 1,
            lockedBy: workerId,
        };
        mockAcquireNextJob.mockResolvedValue(fakeJob);
        mockExecuteJob.mockRejectedValue(new Error('Permanent SMTP failure'));
        mockFailedJob.mockResolvedValue({ count: 1 });

        const processed = await processNextJob(workerId, { maxRetries: 3 });

        expect(processed).toBe(true);
        expect(mockFailedJob).toHaveBeenCalledWith('job-303', workerId, 'Permanent SMTP failure');
        expect(mockRetryJob).not.toHaveBeenCalled();
    });
});
