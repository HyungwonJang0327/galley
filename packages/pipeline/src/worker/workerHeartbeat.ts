// 워커 프로세스 생존 heartbeat — TopBar 생존 점(BW6)이 읽는다(decisions/run-location.md "워커 생존 점").
// Run·IndexJob의 heartbeat는 **일하는 동안만** 쓰여 쉬는 워커를 죽은 것과 구분하지 못한다. 그래서 워커 프로세스가
// 일과 상관없이 Setting 한 줄(`workerHeartbeat`)을 덮어쓴다 — 마이그레이션 없이 "heartbeat 한 줄 조회".
// 판정 기준(30s)은 실행 회수와 같은 HEARTBEAT_TIMEOUT_MS — 둘이 어긋나면 점은 초록인데 실행은 회수되는 일이 생긴다.
import type { PrismaClient } from '@prisma/client';
import { SETTING_KEY } from '../settings/settings.ts';
import { HEARTBEAT_TIMEOUT_MS } from './runOnce.ts';

/** 워커가 살아 있음을 쓴다(덮어쓰기). 값은 ISO 시각 문자열 하나. */
export async function writeWorkerHeartbeat(prisma: PrismaClient, now: Date): Promise<void> {
  const value = now.toISOString();
  await prisma.setting.upsert({
    where: { key: SETTING_KEY.workerHeartbeat },
    create: { key: SETTING_KEY.workerHeartbeat, value },
    update: { value },
  });
}

/** 마지막 워커 heartbeat. 한 번도 쓰인 적 없거나 값이 시각이 아니면 null. */
export async function readWorkerHeartbeat(prisma: PrismaClient): Promise<Date | null> {
  const row = await prisma.setting.findUnique({
    where: { key: SETTING_KEY.workerHeartbeat },
    select: { value: true },
  });
  if (row === null) return null;
  const at = new Date(row.value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * 마지막 heartbeat가 타임아웃 안이면 살아 있다. 경계는 실행 회수(`heartbeat < now - 30s`만 회수)와 같게 — 공백이 정확히
 * 30초면 아직 살아 있다. 시계가 어긋나 미래 시각이어도 살아 있는 것으로 본다.
 */
export function isWorkerAlive(heartbeat: Date | null, now: Date): boolean {
  if (heartbeat === null) return false;
  return now.getTime() - heartbeat.getTime() <= HEARTBEAT_TIMEOUT_MS;
}
