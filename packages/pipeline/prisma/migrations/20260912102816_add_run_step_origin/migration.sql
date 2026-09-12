-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "origin" TEXT NOT NULL DEFAULT 'fresh',
    "sourceRunId" TEXT,
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
