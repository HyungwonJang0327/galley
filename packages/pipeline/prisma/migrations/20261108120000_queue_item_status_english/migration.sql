-- QueueItem.status 저장값을 파일 어휘(한국어)에서 영어로 — decisions/db-value-language.md (TD1).
-- 기존 행은 값을 옮기고, 기본값도 'waiting'으로. 다음 적재(파일 → DB)가 같은 값을 쓰므로 변환은 한 번이면 된다.
UPDATE "QueueItem" SET "status" = CASE "status"
  WHEN '대기' THEN 'waiting'
  WHEN '후보' THEN 'candidate'
  WHEN '보류' THEN 'hold'
  WHEN '완료' THEN 'done'
  ELSE "status" END;

-- RedefineTables (DEFAULT '대기' → 'waiting')
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "order" INTEGER NOT NULL,
    "holdReason" TEXT,
    "missingSince" DATETIME,
    "missingAck" DATETIME,
    "repoNames" TEXT NOT NULL DEFAULT '[]',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "period" TEXT,
    "autoLinkedAt" DATETIME,
    "category" TEXT,
    "completedOn" TEXT,
    "seriesKey" TEXT,
    "episodeNo" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QueueItem" ("autoLinkedAt", "category", "completedOn", "createdAt", "episodeNo", "holdReason", "id", "keywords", "missingAck", "missingSince", "order", "period", "repoNames", "seriesKey", "status", "title", "updatedAt") SELECT "autoLinkedAt", "category", "completedOn", "createdAt", "episodeNo", "holdReason", "id", "keywords", "missingAck", "missingSince", "order", "period", "repoNames", "seriesKey", "status", "title", "updatedAt" FROM "QueueItem";
DROP TABLE "QueueItem";
ALTER TABLE "new_QueueItem" RENAME TO "QueueItem";
CREATE INDEX "QueueItem_status_order_idx" ON "QueueItem"("status", "order");
CREATE INDEX "QueueItem_seriesKey_episodeNo_idx" ON "QueueItem"("seriesKey", "episodeNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
