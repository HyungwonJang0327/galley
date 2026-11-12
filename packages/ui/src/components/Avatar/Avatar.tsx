import { useEffect, useRef, useState, type ComponentProps } from 'react';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends Omit<ComponentProps<'span'>, 'children' | 'role'> {
  /** 접근성 이름이자 머리글자의 출처. 비어 있으면 머리글자 없는 빈 원. */
  name: string;
  /** 이미지 URL. 없거나 로드에 실패하면 머리글자로 그린다. */
  src?: string;
  /** sm 24 · md 32(기본) · lg 40 — `--ui-avatar-size-*` 토큰. */
  size?: AvatarSize;
}

const LATIN_WORD = /^\p{Script=Latin}/u;

/**
 * 이름 → 머리글자. 라틴 문자 단어가 둘 이상이면 앞 두 단어의 첫 글자(대문자), 그 밖(한글·한 단어)은 첫 글자 하나.
 * 결합 문자·서로게이트는 `Intl.Segmenter`가 있으면 grapheme 단위로.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length >= 2 && LATIN_WORD.test(words[0]!) && LATIN_WORD.test(words[1]!))
    return `${firstGrapheme(words[0]!)}${firstGrapheme(words[1]!)}`.toUpperCase();
  return firstGrapheme(words[0]!).toUpperCase();
}

function firstGrapheme(text: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of segmenter.segment(text)) return segment;
  }
  return [...text][0] ?? '';
}

/**
 * 사람·주체 표시용 원. 이미지가 있으면 이미지, 없거나 깨지면 머리글자. 루트가 `role="img"`에 `aria-label={name}`을 갖고
 * 안의 이미지·글자는 장식이다(이름을 두 번 읽지 않게). 색은 neutral 토큰 하나 — 이름별 색 배정은 하지 않는다(앱 몫).
 */
export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // src가 바뀌면 실패 기록을 버린다 — 새 이미지는 다시 시도한다.
  useEffect(() => setFailedSrc(undefined), [src]);
  // SSR 뒤 하이드레이션 전에 이미 실패한 이미지는 error 이벤트가 React에 닿지 않는다 — 마운트 시점에 상태를 직접 본다.
  useEffect(() => {
    const el = imageRef.current;
    if (el !== null && el.complete && el.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  const showImage = src !== undefined && src !== '' && failedSrc !== src;
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ');
  return (
    <span className={classes} role="img" aria-label={name} {...props}>
      {showImage ? (
        <img
          ref={imageRef}
          className={styles.image}
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className={styles.initials} aria-hidden="true">
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
