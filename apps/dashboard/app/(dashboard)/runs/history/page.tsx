// 실행 이력 — 목록형(A) 골격(제목 → 흰 카드) 안에 Table(decisions/table-component.md 첫 자리).
// 데이터·표시값은 서버(lib/run-history), 정렬은 클라 표 컴포넌트. pipeline 값은 lib가 쓰므로 여기도 서버 전용 마커.
import 'server-only';
import { Card, InlineAlert, PageHeader } from 'galley-ui';
import { getRunHistory, RUN_HISTORY_LIMIT } from '../../../../lib/run-history';
import { RouteBreadcrumb } from '../../_components/RouteBreadcrumb';
import { RunHistoryTable } from './RunHistoryTable';
import styles from './page.module.css';

export default async function Page() {
  const result = await getRunHistory();
  return (
    <>
      <PageHeader title="이력" eyebrow={<RouteBreadcrumb pathname="/runs/history" />} />
      <Card>
        {!result.ok ? (
          <InlineAlert tone="danger">{result.error.message}</InlineAlert>
        ) : (
          <>
            <RunHistoryTable rows={result.data} />
            {result.data.length >= RUN_HISTORY_LIMIT ? (
              <p className={styles.note}>최근 {RUN_HISTORY_LIMIT}건까지 표시합니다.</p>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
