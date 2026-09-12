'use client';

import { useEffect } from 'react';
import { Button, Card, EmptyState, PageHeader } from '@galley/ui';

// 렌더 중 예외를 받는 경계. 라우트 그룹 안에 있어 **셸(TopBar·Sidebar)은 위에 그대로 남는다**
// — 클라이언트 컴포넌트라 서버 컴포넌트인 AppFrame을 부를 수 없어, 이것이 셸을 지키는 방법이다.
// (decisions/error-handling.md "페이지 단위 실패")
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 사용자에게는 내부 사정을 보여주지 않는다(스택·경로·SQL). 원인은 서버 로그·콘솔에.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="화면을 그리지 못했습니다" />
      <Card>
        <EmptyState
          message="잠시 후 다시 시도해 주세요. 계속되면 워커·큐 파일 상태를 확인해 주세요."
          action={
            <Button variant="secondary" onClick={reset}>
              다시 시도
            </Button>
          }
        />
      </Card>
    </>
  );
}
