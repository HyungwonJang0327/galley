import Link from 'next/link';
import { Button, Card, EmptyState, PageHeader } from '@galley/ui';
import { AppFrame } from './(dashboard)/_components/AppFrame';

// 매칭되지 않은 경로와 `notFound()` 호출이 모두 여기로 온다. 라우트 그룹 밖이라 그룹 레이아웃을
// 타지 않으므로 셸을 직접 두른다 — 사이드바가 살아 있어야 다른 화면으로 바로 갈 수 있다.
// 셸이 큐 파일·DB를 읽으므로 프리렌더하면 빌드 시점 값이 굳는다(레이아웃과 같은 이유).
export const dynamic = 'force-dynamic';

export const metadata = { title: '페이지를 찾을 수 없음 · Galley' };

export default function NotFound() {
  return (
    <AppFrame>
      <PageHeader title="페이지를 찾을 수 없습니다" />
      <Card>
        <EmptyState
          message="주소가 잘못되었거나 없는 페이지입니다."
          action={
            <Button variant="secondary" render={<Link href="/queue" />}>
              큐로 가기
            </Button>
          }
        />
      </Card>
    </AppFrame>
  );
}
