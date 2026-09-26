// 단계 산출물(마크다운) 렌더 — 서버 컴포넌트(클라 번들에 파서가 실리지 않는다). react-markdown + remark-gfm(표·체크리스트),
// raw HTML은 렌더하지 않는 기본값(모델 출력에 HTML이 섞여도 글자로 보인다) — decisions/navigation.md 2026-09-26.
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ArtifactMarkdown.module.css';

const PLUGINS = [remarkGfm];

export function ArtifactMarkdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={PLUGINS}>{text}</Markdown>
    </div>
  );
}
