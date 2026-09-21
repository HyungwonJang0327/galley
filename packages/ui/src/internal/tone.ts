// 배럴 비공개 내부 모듈 — 색 계열(tone) 어휘와 매핑을 한 곳에 둔다(decisions/ui-package-boundary.md).
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ButtonProps } from '../components/Button';

/** 알림 계열 색·아이콘·낭독 세기. InlineAlert·Toast가 같은 어휘를 쓴다(Badge는 neutral을 더해 따로). */
export type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

/** tone에 맞는 lucide 아이콘 컴포넌트. */
export function toneIcon(tone: Tone) {
  return TONE_ICONS[tone];
}

// `in`은 프로토타입까지 본다('toString' in TONE_ICONS === true) — 자기 키만.
export const isTone = (value: string | undefined): value is Tone =>
  value !== undefined && Object.hasOwn(TONE_ICONS, value);

/** 확인·안내 다이얼로그의 위험도. default=일반 · danger=되돌릴 수 없는 액션. */
export type ConfirmTone = 'default' | 'danger';

/** ConfirmTone → 확인 버튼 variant. */
export function confirmToneVariant(tone: ConfirmTone): NonNullable<ButtonProps['variant']> {
  return tone === 'danger' ? 'danger' : 'primary';
}
