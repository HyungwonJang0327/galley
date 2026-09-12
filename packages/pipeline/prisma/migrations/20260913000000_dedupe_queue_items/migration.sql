-- 적재 경합으로 생긴 중복 QueueItem 정리(일회성 데이터 보정).
-- 한 요청에서 셸과 페이지가 병렬로 적재를 불러, 둘 다 상대의 삽입을 못 보고 같은 줄을 만들었다.
-- 경합 자체는 importQueueFromFile 직렬화로 막았고, 이미 생긴 행을 여기서 지운다.
--
-- 규칙: 같은 제목 중 **먼저 만들어진 행을 남기고**, 뒤에 생긴 행은 **실행이 붙어 있지 않을 때만**
-- 지운다. 실행이 붙은 행을 지우면 이력이 끊긴다(FK로도 막힌다).
DELETE FROM "QueueItem"
WHERE "id" IN (
  SELECT q."id"
  FROM "QueueItem" q
  JOIN (
    SELECT "title", MIN("createdAt") AS "firstCreatedAt"
    FROM "QueueItem"
    GROUP BY "title"
    HAVING COUNT(*) > 1
  ) d ON d."title" = q."title" AND q."createdAt" > d."firstCreatedAt"
  WHERE NOT EXISTS (SELECT 1 FROM "Run" r WHERE r."topicId" = q."id")
);
