import { Badge, TimelineItem, TimelineItems } from 'galley-ui';
import { STEP_OPTIONS, stepTimeline } from '../../../lib/run-labels';
import type { RunStepView } from '../../../lib/run-detail';
import type { RunArtifactViews, StepArtifactView } from '../../../lib/run-artifacts';
import { ArtifactMarkdown } from './ArtifactMarkdown';
import { EvidencePanel, VerificationPanel } from './RunEvidencePanels';
import styles from './RunTimeline.module.css';

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : null);
const seconds = (ms: number | null) => (ms === null ? null : `${Math.round(ms / 1000)}초`);
const tokens = (step: RunStepView) =>
  step.inputTokens === null || step.outputTokens === null
    ? null
    : `${(step.inputTokens + step.outputTokens).toLocaleString('ko-KR')} 토큰`;

function metaOf(step: RunStepView | undefined, carried: boolean): string {
  if (!step || step.status === 'pending') return '대기';
  // 출처 단계의 시각을 못 찾으면(출처 Run 삭제 등) "이전 결과"만 — 꼬리 구분자를 남기지 않는다.
  if (carried) return ['이전 결과', time(step.sourceFinishedAt)].filter(Boolean).join(' · ');
  if (step.status === 'running') return '진행 중';
  if (step.status === 'failed') {
    // 사람이 읽는 건 errorMessage다(decisions/error-handling.md 단계 실패 기록). 코드는 없을 때 폴백.
    const reason = step.errorMessage ?? step.errorCode;
    return [reason, `${step.attemptCount}회 시도`].filter(Boolean).join(' · ');
  }
  return [seconds(step.durationMs), tokens(step)].filter(Boolean).join(' · ');
}

/**
 * 펼침 힌트 — 토글 버튼(제목+meta) 안에 있어야 클릭되고 읽힌다(decisions/layout.md `보기`). 볼 본문이 없으면 그 사실을.
 * 근거 수집은 "linked n · discovered n"(decisions/evidence-collection.md 타임라인)이 힌트를 겸한다.
 */
function hintOf(view: StepArtifactView): string {
  switch (view.kind) {
    case 'markdown':
    case 'verification':
      return '보기';
    case 'evidence':
      return [
        `linked ${view.evidence.linked} · discovered ${view.evidence.discovered}`,
        view.evidence.unreadable > 0 ? `읽지 못함 ${view.evidence.unreadable}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'missing':
      return '산출물 없음';
    case 'unavailable':
      return '산출물 읽기 실패';
  }
}

/** 근거 검증 줄의 배지 "근거 없음 n · 불확실 n" — unsupported ≥ 1이면 주황(decisions/layout.md). */
function verifyBadge(view: StepArtifactView | undefined) {
  if (view?.kind !== 'verification') return undefined;
  const { unsupported, uncertain } = view.verification.counts;
  return (
    <Badge tone={unsupported > 0 ? 'warning' : 'neutral'}>
      근거 없음 {unsupported} · 불확실 {uncertain}
    </Badge>
  );
}

/** 펼침 내용 — 산출물이 있으면 마크다운, 없거나 못 읽으면 한 줄 안내(검수자가 왜 비었는지 알아야 한다). */
function artifactPanel(view: StepArtifactView) {
  switch (view.kind) {
    case 'evidence':
      return <EvidencePanel evidence={view.evidence} />;
    case 'verification':
      return <VerificationPanel verification={view.verification} />;
    case 'markdown':
      return (
        <>
          {view.thumbnailUrl === undefined ? null : (
            // 1200×630 원본을 패널 폭에 맞춰 줄인다(글자 검수 가능한 크기). lazy — 접힌(hidden) 동안은 요청하지 않는다.
            // 캐시하지 않는 GET이라 재실행 뒤에도 최신 그림.
            <img
              className={styles.thumbnail}
              src={view.thumbnailUrl}
              alt="썸네일 미리보기"
              width={1200}
              height={630}
              loading="lazy"
            />
          )}
          <ArtifactMarkdown text={view.text} />
        </>
      );
    case 'missing':
      return (
        <p className={styles.note}>
          산출물 파일이 DATA_DIR에 없습니다. Mock 실행이거나 산출물을 쓰기 전의 실행입니다.
        </p>
      );
    case 'unavailable':
      // role="alert"를 두지 않는다 — 항상 DOM에 있고 hidden만 바뀌는 패널이라 라이브 리전이 읽어 주지 않는다.
      return <p className={styles.note}>{view.message}</p>;
  }
}

/**
 * 단계 6줄. `artifacts`에 있는 단계는 펼쳐서 산출물을 읽을 수 있다(제목+meta가 토글, meta 끝에 "보기" 힌트) —
 * 읽기는 서버(page)가 하고 여기는 결과만 받는다(decisions/layout.md 타임라인 한 줄).
 */
export function RunTimeline({
  steps,
  artifacts = {},
}: {
  steps: RunStepView[];
  artifacts?: RunArtifactViews;
}) {
  const byName = new Map(steps.map((s) => [s.name, s]));
  return (
    <TimelineItems>
      {STEP_OPTIONS.map(({ name, label }, idx) => {
        const step = byName.get(name);
        const line = stepTimeline(step ?? { status: 'pending', origin: 'fresh' });
        const view = artifacts[name];
        return (
          <TimelineItem
            key={name}
            status={line.status}
            statusLabel={line.statusLabel}
            title={label}
            meta={[metaOf(step, line.carried), view && hintOf(view)].filter(Boolean).join(' · ')}
            trailing={verifyBadge(view)}
            isLast={idx === STEP_OPTIONS.length - 1}
          >
            {view === undefined ? undefined : artifactPanel(view)}
          </TimelineItem>
        );
      })}
    </TimelineItems>
  );
}
