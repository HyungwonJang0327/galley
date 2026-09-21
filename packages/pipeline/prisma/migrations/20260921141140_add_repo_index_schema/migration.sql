-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "headSha" TEXT,
    "lastIndexedAt" DATETIME,
    "lastIndexModelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'indexing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepoAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "pointers" TEXT NOT NULL,
    "period" TEXT,
    "summaryOnly" BOOLEAN NOT NULL DEFAULT false,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepoAnalysis_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicAnalysisLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopicAnalysisLink_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "QueueItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TopicAnalysisLink_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "RepoAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromSha" TEXT,
    "toSha" TEXT,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "workerId" TEXT,
    "heartbeat" DATETIME,
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "progressCursor" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndexJob_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '대기',
    "order" INTEGER NOT NULL,
    "holdReason" TEXT,
    "missingSince" DATETIME,
    "missingAck" DATETIME,
    "repoNames" TEXT NOT NULL DEFAULT '[]',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "period" TEXT,
    "category" TEXT,
    "completedOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QueueItem" ("category", "completedOn", "createdAt", "holdReason", "id", "missingAck", "missingSince", "order", "status", "title", "updatedAt") SELECT "category", "completedOn", "createdAt", "holdReason", "id", "missingAck", "missingSince", "order", "status", "title", "updatedAt" FROM "QueueItem";
DROP TABLE "QueueItem";
ALTER TABLE "new_QueueItem" RENAME TO "QueueItem";
CREATE INDEX "QueueItem_status_order_idx" ON "QueueItem"("status", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Repo_path_key" ON "Repo"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Repo_name_key" ON "Repo"("name");

-- CreateIndex
CREATE INDEX "Repo_status_idx" ON "Repo"("status");

-- CreateIndex
CREATE INDEX "RepoAnalysis_repoId_kind_idx" ON "RepoAnalysis"("repoId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RepoAnalysis_repoId_key_key" ON "RepoAnalysis"("repoId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TopicAnalysisLink_topicId_analysisId_key" ON "TopicAnalysisLink"("topicId", "analysisId");

-- CreateIndex
CREATE INDEX "IndexJob_status_createdAt_idx" ON "IndexJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IndexJob_repoId_createdAt_idx" ON "IndexJob"("repoId", "createdAt");
