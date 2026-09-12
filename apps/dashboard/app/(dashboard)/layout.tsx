import type { ReactNode } from 'react';
import { AppFrame } from './_components/AppFrame';

// 셸의 배지·홈 타일은 요청마다 주제_큐.md를 읽어야 한다(파일이 진실 — queue-sync-direction).
// 이 설정이 없으면 Next가 이 레이아웃을 쓰는 라우트(홈·/runs·/publish·/settings/*)를
// 빌드 시점 값으로 프리렌더해, 큐를 고쳐도 화면이 그대로다.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
