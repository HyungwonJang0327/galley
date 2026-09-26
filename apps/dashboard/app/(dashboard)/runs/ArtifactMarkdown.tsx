// 단계 산출물(마크다운) 렌더 — 서버 컴포넌트(클라 번들에 파서가 실리지 않는다 — 마커로 고정). react-markdown + remark-gfm
// (표·체크리스트), raw HTML은 렌더하지 않는 기본값(모델 출력에 HTML이 섞여도 글자로 보인다) — decisions/navigation.md 2026-09-26.
// 링크는 새 탭(검수 화면을 떠나지 않게), 이미지는 렌더하지 않는다(펼치는 순간 브라우저가 밖으로 요청을 보내는 경로를 닫는다 —
// 파이프라인은 이미지를 만들지 않아 `![]()`는 대개 가짜 주소다). 사용자 결정 2026-09-26.
import 'server-only';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ArtifactMarkdown.module.css';

const PLUGINS = [remarkGfm];

/** react-markdown이 붙이는 hast `node`는 DOM 속성이 아니라 떼고 넘긴다. */
function domProps<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest: T = { ...props };
  delete rest.node;
  return rest;
}

const COMPONENTS: Components = {
  a: (props) => <a {...domProps(props)} target="_blank" rel="noopener noreferrer" />,
  // 이미지 자리는 글자로만 — 주소를 보여 주면 검수자가 가짜 주소인지 바로 안다.
  img: ({ alt, src }) => (
    <span className={styles.imagePlaceholder}>
      이미지 자리{alt ? `: ${alt}` : ''}
      {typeof src === 'string' && src !== '' ? ` (${src})` : ''}
    </span>
  ),
};

export function ArtifactMarkdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
