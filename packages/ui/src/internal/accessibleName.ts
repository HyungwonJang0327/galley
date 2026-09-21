'use client';
// 배럴 비공개 내부 모듈 — 이름 없는 컨트롤을 개발 모드에서 잡는다(decisions/ui-package-boundary.md).
import { useEffect } from 'react';
import { useInsideFormField } from '../primitives/FormField/FormFieldContext';

// @types/node 없이 쓰기 위한 최소 선언. 소비자 번들러가 NODE_ENV를 치환한다(Base UI·React와 같은 관례).
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * 컨트롤에 접근성 이름(children 라벨·aria-label)이 없고 FormField 안도 아니면 개발 모드에서 한 번 경고한다.
 * 타입으로 막을 수 없는 이유: FormField 안에서는 Field.Label이 이름을 주므로 둘 다 없어도 정상이다.
 */
export function useAccessibleNameWarning(component: string, hasName: boolean): void {
  const insideField = useInsideFormField();
  useEffect(() => {
    if (typeof process === 'undefined' || process.env.NODE_ENV === 'production') return;
    if (hasName || insideField) return;
    console.warn(
      `galley-ui: <${component}>에 접근성 이름이 없습니다. children으로 라벨을 주거나 aria-label을 넘기세요(FormField 안이면 필드 라벨이 이름이 됩니다).`,
    );
  }, [component, hasName, insideField]);
}
