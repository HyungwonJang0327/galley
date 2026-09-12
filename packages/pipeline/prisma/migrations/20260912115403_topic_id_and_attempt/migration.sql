/*
  Warnings:

  - Added the required column `topicId` to the `Run` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "holdReason" TEXT;
ALTER TABLE "QueueItem" ADD COLUMN "missingSince" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "topicSlug" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'running',
    "workerState" TEXT NOT NULL DEFAULT 'queued',
    "workerId" TEXT,
    "heartbeat" DATETIME,
    "modelId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Run_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "QueueItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("createdAt", "finishedAt", "heartbeat", "id", "modelId", "startedAt", "status", "topicSlug", "topicTitle", "updatedAt", "workerId", "workerState") SELECT "createdAt", "finishedAt", "heartbeat", "id", "modelId", "startedAt", "status", "topicSlug", "topicTitle", "updatedAt", "workerId", "workerState" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE INDEX "Run_status_startedAt_idx" ON "Run"("status", "startedAt");
CREATE INDEX "Run_topicId_attempt_idx" ON "Run"("topicId", "attempt");
CREATE INDEX "Run_topicSlug_startedAt_idx" ON "Run"("topicSlug", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
