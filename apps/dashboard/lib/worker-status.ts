// TopBar 워커 생존 점(BW6)의 판정(서버 전용). 워커가 5초마다 쓰는 Setting 한 줄을 읽어 30초 안이면 살아 있다
// — decisions/run-location.md "워커 생존 점". 셸 레이아웃이 매 요청 부르므로 던지지 않는다(실패는 "꺼짐"으로).
import 'server-only';
import { isWorkerAlive, prisma, readWorkerHeartbeat } from '@galley/pipeline';

export async function getWorkerAlive(now: Date = new Date()): Promise<boolean> {
  try {
    return isWorkerAlive(await readWorkerHeartbeat(prisma), now);
  } catch {
    return false;
  }
}
