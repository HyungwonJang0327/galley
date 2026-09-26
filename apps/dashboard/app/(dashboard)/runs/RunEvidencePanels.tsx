// 근거 수집·근거 검증 줄의 펼침 내용(BE13, 서버 컴포넌트). 값은 lib/run-artifacts가 줄인 것이고 여기서 한국어 라벨만 붙인다
// (DB·파일 값은 영어 — decisions/db-value-language.md). 조각 미리보기는 DATA_DIR 쪽이라 로컬 화면에만 보인다.
import type { ClaimView, EvidenceView, VerificationView } from '../../../lib/run-artifacts';
import styles from './RunEvidencePanels.module.css';

const SOURCE_LABEL = { linked: '연결', discovered: '탐색' } as const;
const STATUS_LABEL = {
  supported: '근거 있음',
  unsupported: '근거 없음',
  uncertain: '불확실',
} as const;
const KIND_LABEL = {
  number: '숫자',
  path: '경로',
  identifier: '식별자',
  statement: '서술',
} as const;
/** 판정 사유(ClaimReason) — 코드 의미는 packages/pipeline evidence/verification.ts 주석. 사용자 결정(BE13 리뷰 M3): 화면에 표시. */
const REASON_LABEL: Record<NonNullable<ClaimView['reason']>, string> = {
  'not-in-evidence': '근거에 없음',
  generalizable: '근거에 없어 일반화된 표현으로 봄',
  'in-analysis-summary': '분석 요약에만 있음',
  judged: '모델 판정',
  'not-judged': '판정 상한 초과',
  'judge-missing': '모델 판정 누락',
  'judge-unparsed': '판정 출력 깨짐',
  'judge-truncated': '판정 출력 잘림',
};
const JUDGE_NOTE: Partial<Record<VerificationView['judge'], string>> = {
  unparsed: '모델 판정 출력이 깨져 서술은 전부 불확실로 두었습니다.',
  truncated: '모델 판정 출력이 잘려 서술은 전부 불확실로 두었습니다.',
};

const range = ({ start, end }: { start: number; end: number }) =>
  start === end ? `L${start}` : `L${start}-${end}`;

export function EvidencePanel({ evidence }: { evidence: EvidenceView }) {
  return (
    <div className={styles.panel}>
      <p className={styles.summary}>
        연결 {evidence.linked} · 탐색 {evidence.discovered}
        {evidence.unreadable > 0 ? ` · 읽지 못한 포인터 ${evidence.unreadable}` : ''}
      </p>
      {evidence.filtered ? null : (
        // 사용자 결정(BE13 리뷰 L8): 필터를 안 거친 조각은 브라우저로 보내지 않는다 — 경로·해시·수만.
        <p className={styles.note}>
          식별 정보 필터를 거치지 않아 조각을 표시하지 않습니다. `.galley/redact.json`을 두고 근거
          수집부터 다시 실행하면 보입니다.
        </p>
      )}
      {evidence.items.length === 0 ? (
        <p className={styles.note}>근거 항목이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {evidence.items.map((item, i) => (
            <li key={i} className={styles.item}>
              <div className={styles.head}>
                <code className={styles.code}>
                  {item.path}:{range(item.lineRange)}
                </code>
                <span className={styles.muted}>
                  {item.commit} · {item.date} · {SOURCE_LABEL[item.source]}
                  {item.redacted ? ' · 치환됨' : ''}
                  {item.truncated ? ' · 잘림' : ''}
                </span>
              </div>
              {item.note ? <p className={styles.note}>{item.note}</p> : null}
              {evidence.filtered && item.snippetPreview.length > 0 ? (
                // 가로 스크롤 영역은 키보드 초점이 가야 한다(axe scrollable-region-focusable).
                <pre className={styles.snippet} tabIndex={0} aria-label="근거 조각 미리보기">
                  {item.snippetPreview.join('\n')}
                  {item.hasMore ? '\n…' : ''}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: ClaimView }) {
  return (
    <li className={styles.item} data-status={claim.status}>
      <div className={styles.head}>
        <span className={styles.status} data-status={claim.status}>
          {STATUS_LABEL[claim.status]}
        </span>
        <span className={styles.muted}>
          {KIND_LABEL[claim.kind]} · 본문 L{claim.line}
          {claim.reason ? ` · ${REASON_LABEL[claim.reason]}` : ''}
        </span>
      </div>
      <p className={styles.claim}>{claim.text}</p>
      {claim.evidenceRef ? (
        <code className={styles.code}>
          {claim.evidenceRef.path}:{range(claim.evidenceRef.lineRange)} · {claim.evidenceRef.commit}
        </code>
      ) : null}
      {claim.note ? <p className={styles.note}>{claim.note}</p> : null}
    </li>
  );
}

export function VerificationPanel({ verification }: { verification: VerificationView }) {
  const { counts } = verification;
  const judgeNote = JUDGE_NOTE[verification.judge];
  return (
    <div className={styles.panel}>
      <p className={styles.summary}>
        근거 있음 {counts.supported} · 근거 없음 {counts.unsupported} · 불확실 {counts.uncertain}
        {verification.verbatimMatches > 0
          ? ` · 근거 조각을 그대로 담은 자리 ${verification.verbatimMatches}`
          : ''}
      </p>
      {judgeNote ? <p className={styles.note}>{judgeNote}</p> : null}
      {verification.claims.length === 0 ? (
        <p className={styles.note}>추출된 주장이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {verification.claims.map((claim, i) => (
            <ClaimRow key={i} claim={claim} />
          ))}
        </ul>
      )}
    </div>
  );
}
