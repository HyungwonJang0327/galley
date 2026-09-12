-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicSlug" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '실행 중',
    "workerState" TEXT NOT NULL DEFAULT 'queued',
    "workerId" TEXT,
    "heartbeat" DATETIME,
    "modelId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '대기',
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

-- CreateIndex
CREATE INDEX "Run_status_startedAt_idx" ON "Run"("status", "startedAt");

-- CreateIndex
CREATE INDEX "Run_topicSlug_startedAt_idx" ON "Run"("topicSlug", "startedAt");

-- CreateIndex
CREATE INDEX "RunStep_runId_order_idx" ON "RunStep"("runId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RunStep_runId_order_key" ON "RunStep"("runId", "order");
