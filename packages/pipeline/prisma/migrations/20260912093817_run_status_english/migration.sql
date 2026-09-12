-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicSlug" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "workerState" TEXT NOT NULL DEFAULT 'queued',
    "workerId" TEXT,
    "heartbeat" DATETIME,
    "modelId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Run" ("createdAt", "finishedAt", "heartbeat", "id", "modelId", "startedAt", "status", "topicSlug", "topicTitle", "updatedAt", "workerId", "workerState") SELECT "createdAt", "finishedAt", "heartbeat", "id", "modelId", "startedAt", "status", "topicSlug", "topicTitle", "updatedAt", "workerId", "workerState" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE INDEX "Run_status_startedAt_idx" ON "Run"("status", "startedAt");
CREATE INDEX "Run_topicSlug_startedAt_idx" ON "Run"("topicSlug", "startedAt");
CREATE TABLE "new_RunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "modelId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "durationMs" INTEGER,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RunStep" ("costUsd", "createdAt", "durationMs", "finishedAt", "id", "inputTokens", "modelId", "name", "order", "outputTokens", "runId", "startedAt", "status", "updatedAt") SELECT "costUsd", "createdAt", "durationMs", "finishedAt", "id", "inputTokens", "modelId", "name", "order", "outputTokens", "runId", "startedAt", "status", "updatedAt" FROM "RunStep";
DROP TABLE "RunStep";
ALTER TABLE "new_RunStep" RENAME TO "RunStep";
CREATE INDEX "RunStep_runId_order_idx" ON "RunStep"("runId", "order");
CREATE UNIQUE INDEX "RunStep_runId_order_key" ON "RunStep"("runId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
