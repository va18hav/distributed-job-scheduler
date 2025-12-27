import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { prisma } from '../packages/db/src/prisma.js';
import { acquireNextJob, completedJob } from '../apps/worker/src/repositories/job.repository.js';

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

function formatMs(ms: number): string {
    return `${ms.toFixed(2)} ms`;
}

async function runIndexVsSeqScanBenchmark() {
    console.log('\n1. INDEXED vs. UNINDEXED POLLING LATENCY (100,000 JOBS IN DB)');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);

    await prisma.$executeRawUnsafe(`
        INSERT INTO "Job" ("id", "type", "payload", "status", "priority", "attempts", "availableAt", "createdAt", "updatedAt")
        SELECT
            gen_random_uuid()::text,
            CASE WHEN i % 2 = 0 THEN 'send_email' ELSE 'image_processing' END,
            '{"benchmark": true}'::jsonb,
            CASE
                WHEN i <= 90000 THEN 'COMPLETED'::"JobStatus"
                WHEN i <= 95000 THEN 'FAILED'::"JobStatus"
                ELSE 'PENDING'::"JobStatus"
            END,
            (i % 10),
            CASE WHEN i <= 95000 THEN 1 ELSE 0 END,
            CASE
                WHEN i > 95000 AND i <= 99000 THEN NOW() + INTERVAL '2 hours'
                ELSE NOW() - INTERVAL '5 minutes'
            END,
            NOW() - (i || ' seconds')::interval,
            NOW()
        FROM generate_series(1, 100000) AS s(i);
    `);

    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_job_polling";`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_job_stale_locks";`);
    await prisma.$executeRawUnsafe(`ANALYZE "Job";`);

    const unindexedLatencies: number[] = [];
    for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        await acquireNextJob('bench-unindexed');
        unindexedLatencies.push(performance.now() - t0);
    }
    unindexedLatencies.sort((a, b) => a - b);

    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "idx_job_polling"
        ON "Job"("status", "availableAt", "priority" DESC, "createdAt" ASC);
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "idx_job_stale_locks"
        ON "Job"("status", "lockedAt");
    `);
    await prisma.$executeRawUnsafe(`ANALYZE "Job";`);

    const indexedLatencies: number[] = [];
    for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        await acquireNextJob('bench-indexed');
        indexedLatencies.push(performance.now() - t0);
    }
    indexedLatencies.sort((a, b) => a - b);

    console.log(`Unindexed p50: ${formatMs(percentile(unindexedLatencies, 50))}`);
    console.log(`Indexed   p50: ${formatMs(percentile(indexedLatencies, 50))}`);
}

async function main() {
    try {
        await runIndexVsSeqScanBenchmark();
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
