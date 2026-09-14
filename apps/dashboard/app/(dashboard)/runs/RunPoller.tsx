'use client';
// 클라이언트 컴포넌트라 pipeline·run-labels를 import하지 않는다(서버 전용 번들이 딸려온다 —
// decisions/server-only-boundary.md). "진행 중인가"는 서버가 판정해 active로 넘긴다.
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
const POLL_MS = 2000;

export function RunPoller({ active }: { active: boolean }) {
  const router = useRouter();
  const wasInProgress = useRef(false);
  useEffect(() => {
    if (wasInProgress.current && !active) {
      router.refresh();
    }
    wasInProgress.current = active;
  }, [active, router]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // visibilitychange는 visible 상태에서도 연달아 올 수 있다(탭 전환·창 포커스). 이미 돌고 있으면
    // 새 interval을 겹치지 않는다 — 겹치면 stop()이 마지막 것만 지워 나머지가 샌다.
    const start = () => {
      if (timer !== undefined) return;
      timer = setInterval(() => router.refresh(), POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        router.refresh();
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, router]);
  return null;
}
