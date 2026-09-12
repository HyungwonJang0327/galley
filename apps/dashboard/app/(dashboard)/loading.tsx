import { Card, PageHeader } from '@galley/ui';

// 셸 라우트는 전부 force-dynamic이라 DB·큐 파일을 읽는 동안 Content가 비어 있게 된다.
// 그룹 안에 있어 셸은 그대로 남고 카드 자리만 이 화면으로 채운다.
export default function DashboardLoading() {
  return (
    <>
      <PageHeader title="불러오는 중" />
      <Card>
        <p role="status" aria-live="polite">
          불러오는 중…
        </p>
      </Card>
    </>
  );
}
