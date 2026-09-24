-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "episodeNo" INTEGER;
ALTER TABLE "QueueItem" ADD COLUMN "seriesKey" TEXT;

-- CreateIndex
CREATE INDEX "QueueItem_seriesKey_episodeNo_idx" ON "QueueItem"("seriesKey", "episodeNo");
