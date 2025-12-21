-- AlterTable
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_job_polling" ON "Job"("status", "availableAt", "priority" DESC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_job_stale_locks" ON "Job"("status", "lockedAt");
