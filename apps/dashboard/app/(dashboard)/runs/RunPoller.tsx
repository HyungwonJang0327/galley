'use client';
import { useRouter } from 'next/navigation';
import { isRunInProgress } from '../../../lib/run-labels';
import { useEffect, useRef } from 'react';
const POLL_MS = 2000;

export function RunPoller({ status }: { status: string }) {
  const router = useRouter();
  const inProgress = isRunInProgress(status);
  const wasInProgress = useRef(false);
  useEffect(() => {
    if (wasInProgress.current && !inProgress) {
      router.refresh();
    }
    wasInProgress.current = inProgress;
  }, [inProgress, router]);

  useEffect(() => {
    if (!inProgress) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer = setInterval(() => router.refresh(), POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
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
  }, [inProgress, router]);
  return null;
}
