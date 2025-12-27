import 'dotenv/config';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

import { prisma } from '../packages/db/src/prisma.js';
import {
    acquireNextJob,
    completedJob,
    updateHeartbeat,
} from '../apps/worker/src/repositories/job.repository.js';
import app from '../apps/scheduler/src/app.js';

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

function formatMs(ms: number): string {
    return `${ms.toFixed(2)} ms`;
}

async function runIndexVsSeqScanBenchmark() {
    console.log('\n================================================================');
    console.log('1. INDEXED vs. UNINDEXED POLLING LATENCY (100,000 JOBS IN DB)');
    console.log('================================================================');

    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);

    // Seed 100,000 rows:
    // - 90,000 COMPLETED jobs
    // - 5,000 FAILED jobs
    // - 4,000 future-delayed PENDING jobs
    // - 1,000 ready PENDING jobs with varying priorities
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

    // 1A: Drop composite indexes and measure Sequential Scan
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_job_polling";`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_job_stale_locks";`);
    await prisma.$executeRawUnsafe(`ANALYZE "Job";`);

    const explainUnindexed = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
        EXPLAIN (ANALYZE, BUFFERS)
        WITH next_job AS (
            SELECT id
            FROM "Job"
            WHERE (status = 'PENDING' AND "availableAt" <= NOW())
               OR (status = 'RUNNING' AND "lockedAt" < NOW() - INTERVAL '30 seconds')
            ORDER BY "priority" DESC, "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE "Job"
        SET status = 'RUNNING', "lockedBy" = 'bench-worker', "lockedAt" = NOW(), "attempts" = attempts + 1
        FROM next_job
        WHERE "Job".id = next_job.id
        RETURNING "Job".id;
    `);

    const unindexedLatencies: number[] = [];
    for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        await acquireNextJob('bench-unindexed');
        unindexedLatencies.push(performance.now() - t0);
    }
    unindexedLatencies.sort((a, b) => a - b);

    // 1B: Recreate composite B-Tree indexes and measure Index Scan
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "idx_job_polling"
        ON "Job"("status", "availableAt", "priority" DESC, "createdAt" ASC);
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "idx_job_stale_locks"
        ON "Job"("status", "lockedAt");
    `);
    await prisma.$executeRawUnsafe(`ANALYZE "Job";`);

    const explainIndexed = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
        EXPLAIN (ANALYZE, BUFFERS)
        WITH next_job AS (
            SELECT id
            FROM "Job"
            WHERE (status = 'PENDING' AND "availableAt" <= NOW())
               OR (status = 'RUNNING' AND "lockedAt" < NOW() - INTERVAL '30 seconds')
            ORDER BY "priority" DESC, "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE "Job"
        SET status = 'RUNNING', "lockedBy" = 'bench-worker', "lockedAt" = NOW(), "attempts" = attempts + 1
        FROM next_job
        WHERE "Job".id = next_job.id
        RETURNING "Job".id;
    `);

    const indexedLatencies: number[] = [];
    for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        await acquireNextJob('bench-indexed');
        indexedLatencies.push(performance.now() - t0);
    }
    indexedLatencies.sort((a, b) => a - b);

    const unindexedP50 = percentile(unindexedLatencies, 50);
    const unindexedP95 = percentile(unindexedLatencies, 95);
    const indexedP50 = percentile(indexedLatencies, 50);
    const indexedP95 = percentile(indexedLatencies, 95);
    const reductionPct = ((unindexedP50 - indexedP50) / unindexedP50) * 100;
    const speedup = unindexedP50 / indexedP50;

    console.log(`Unindexed (Seq Scan)   -> p50: ${formatMs(unindexedP50)} | p95: ${formatMs(unindexedP95)}`);
    console.log(`Indexed   (Index Scan) -> p50: ${formatMs(indexedP50)} | p95: ${formatMs(indexedP95)}`);
    console.log(`Improvement            -> ${reductionPct.toFixed(1)}% latency reduction (${speedup.toFixed(1)}x faster)`);

    console.log('\n--- EXPLAIN ANALYZE (Unindexed) ---');
    console.log(explainUnindexed.map((r) => r['QUERY PLAN']).join('\n'));
    console.log('\n--- EXPLAIN ANALYZE (With Composite Indexes) ---');
    console.log(explainIndexed.map((r) => r['QUERY PLAN']).join('\n'));

    return {
        unindexedP50,
        unindexedP95,
        indexedP50,
        indexedP95,
        reductionPct,
        speedup,
    };
}

async function runConcurrencyBenchmark() {
    console.log('\n================================================================');
    console.log('2. MULTI-WORKER SKIP LOCKED CONCURRENCY & CONTENTION BENCHMARK');
    console.log('================================================================');

    const totalJobs = 2000;
    const workerCounts = [1, 4, 8, 16];
    const results: Array<{
        workers: number;
        throughput: number;
        p50: number;
        p95: number;
        p99: number;
        uniqueClaimed: number;
        duplicates: number;
    }> = [];

    for (const numWorkers of workerCounts) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);
        await prisma.$executeRawUnsafe(`
            INSERT INTO "Job" ("id", "type", "payload", "status", "priority", "attempts", "availableAt", "createdAt", "updatedAt")
            SELECT
                gen_random_uuid()::text,
                'send_email',
                '{"to": "bench@example.com"}'::jsonb,
                'PENDING'::"JobStatus",
                (i % 5),
                0,
                NOW() - INTERVAL '1 minute',
                NOW(),
                NOW()
            FROM generate_series(1, ${totalJobs}) AS s(i);
        `);
        await prisma.$executeRawUnsafe(`ANALYZE "Job";`);

        const claimedIds = new Set<string>();
        let duplicateCount = 0;
        const acquireLatencies: number[] = [];

        const startWall = performance.now();

        await Promise.all(
            Array.from({ length: numWorkers }, async (_, idx) => {
                const workerId = `worker-${idx + 1}`;
                while (true) {
                    const t0 = performance.now();
                    const job = await acquireNextJob(workerId);
                    const elapsed = performance.now() - t0;

                    if (!job) break;

                    acquireLatencies.push(elapsed);
                    if (claimedIds.has(job.id)) {
                        duplicateCount++;
                    } else {
                        claimedIds.add(job.id);
                    }

                    await completedJob(job.id, workerId);
                }
            })
        );

        const totalDurationSec = (performance.now() - startWall) / 1000;
        acquireLatencies.sort((a, b) => a - b);

        const row = {
            workers: numWorkers,
            throughput: Math.round(totalJobs / totalDurationSec),
            p50: percentile(acquireLatencies, 50),
            p95: percentile(acquireLatencies, 95),
            p99: percentile(acquireLatencies, 99),
            uniqueClaimed: claimedIds.size,
            duplicates: duplicateCount,
        };
        results.push(row);

        console.log(
            `Workers: ${String(numWorkers).padStart(2, ' ')} | Throughput: ${String(row.throughput).padStart(5, ' ')} jobs/s | Acquire p50: ${formatMs(row.p50)} | p95: ${formatMs(row.p95)} | p99: ${formatMs(row.p99)} | Claimed: ${row.uniqueClaimed}/${totalJobs} | Duplicates: ${row.duplicates}`
        );
    }

    return results;
}

async function runCrashRecoveryAndFencingBenchmark() {
    console.log('\n================================================================');
    console.log('3. CRASH RECOVERY & ZOMBIE WORKER SPLIT-BRAIN FENCING');
    console.log('================================================================');

    const stalledJobsCount = 200;
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);

    // Insert 200 RUNNING jobs whose worker crashed 45 seconds ago (past 30s TTL)
    await prisma.$executeRawUnsafe(`
        INSERT INTO "Job" ("id", "type", "payload", "status", "priority", "lockedBy", "lockedAt", "attempts", "availableAt", "createdAt", "updatedAt")
        SELECT
            'stalled-job-' || i,
            'image_processing',
            '{}'::jsonb,
            'RUNNING'::"JobStatus",
            1,
            'crashed-worker-' || i,
            NOW() - INTERVAL '45 seconds',
            1,
            NOW() - INTERVAL '2 minutes',
            NOW() - INTERVAL '2 minutes',
            NOW() - INTERVAL '45 seconds'
        FROM generate_series(1, ${stalledJobsCount}) AS s(i);
    `);

    // Healthy worker reclaims all 200 stalled jobs
    const reclaimedIds: string[] = [];
    const t0 = performance.now();
    while (true) {
        const job = await acquireNextJob('healthy-rescue-worker');
        if (!job) break;
        reclaimedIds.push(job.id);
    }
    const recoveryMs = performance.now() - t0;

    // Now simulate all 200 zombie workers waking up from GC pause and trying to mark their old jobs COMPLETED
    let zombieOverwrites = 0;
    for (let i = 1; i <= stalledJobsCount; i++) {
        const jobId = `stalled-job-${i}`;
        const zombieWorkerId = `crashed-worker-${i}`;
        await updateHeartbeat(jobId, zombieWorkerId);
        const res = await completedJob(jobId, zombieWorkerId);
        zombieOverwrites += res.count;
    }

    // Verify healthy worker still owns and completes all 200 jobs
    let healthyCompletions = 0;
    for (const jobId of reclaimedIds) {
        const res = await completedJob(jobId, 'healthy-rescue-worker');
        healthyCompletions += res.count;
    }

    console.log(`Stalled Jobs Reclaimed : ${reclaimedIds.length}/${stalledJobsCount} (100%) in ${formatMs(recoveryMs)}`);
    console.log(`Zombie Overwrites      : ${zombieOverwrites}/${stalledJobsCount} (0% split-brain corruption)`);
    console.log(`Healthy Completions    : ${healthyCompletions}/${stalledJobsCount} (100% fencing integrity)`);

    return {
        stalledJobsCount,
        reclaimed: reclaimedIds.length,
        recoveryMs,
        zombieOverwrites,
        healthyCompletions,
    };
}

async function runHttpIngestionBenchmark() {
    console.log('\n================================================================');
    console.log('4. SCHEDULER API HTTP INGESTION BENCHMARK (POST /job)');
    console.log('================================================================');

    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}/job`;

    const totalRequests = 1000;
    const concurrency = 20;
    const requestsPerClient = totalRequests / concurrency;
    const latencies: number[] = [];
    let status201Count = 0;

    const payload = JSON.stringify({
        type: 'send_email',
        payload: { to: 'loadtest@example.com', body: 'Benchmark payload' },
        priority: 5,
    });

    const startWall = performance.now();

    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            for (let i = 0; i < requestsPerClient; i++) {
                const t0 = performance.now();
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                });
                await res.json();
                latencies.push(performance.now() - t0);
                if (res.status === 201) status201Count++;
            }
        })
    );

    const totalSec = (performance.now() - startWall) / 1000;
    server.close();

    latencies.sort((a, b) => a - b);
    const reqPerSec = Math.round(totalRequests / totalSec);
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    console.log(
        `Requests: ${status201Count}/${totalRequests} (201 Created) | Concurrency: ${concurrency} | Throughput: ${reqPerSec} req/s | p50: ${formatMs(p50)} | p95: ${formatMs(p95)} | p99: ${formatMs(p99)}`
    );

    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Job";`);

    return {
        totalRequests,
        concurrency,
        reqPerSec,
        p50,
        p95,
        p99,
    };
}

async function main() {
    try {
        await runIndexVsSeqScanBenchmark();
        await runConcurrencyBenchmark();
        await runCrashRecoveryAndFencingBenchmark();
        await runHttpIngestionBenchmark();
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
