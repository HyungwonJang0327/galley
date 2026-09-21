-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepoAnalysis" (
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
    "filtered" BOOLEAN NOT NULL DEFAULT false,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepoAnalysis_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RepoAnalysis" ("costUsd", "createdAt", "id", "inputTokens", "key", "keywords", "kind", "modelId", "outputTokens", "period", "pointers", "repoId", "summary", "summaryOnly", "title", "updatedAt") SELECT "costUsd", "createdAt", "id", "inputTokens", "key", "keywords", "kind", "modelId", "outputTokens", "period", "pointers", "repoId", "summary", "summaryOnly", "title", "updatedAt" FROM "RepoAnalysis";
DROP TABLE "RepoAnalysis";
ALTER TABLE "new_RepoAnalysis" RENAME TO "RepoAnalysis";
CREATE INDEX "RepoAnalysis_repoId_kind_idx" ON "RepoAnalysis"("repoId", "kind");
CREATE UNIQUE INDEX "RepoAnalysis_repoId_key_key" ON "RepoAnalysis"("repoId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
