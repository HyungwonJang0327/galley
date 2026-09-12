import { describe, it, expect } from 'vitest';
import { nextSchedule } from './schedule';

const TZ = 'Asia/Seoul';

/** 해당 시간대에서의 요일·시·분(기대값 계산용 — 달력 요일을 테스트에 적지 않기 위해). */
function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

// 하루 간격으로 한 주를 훑는다(어떤 요일에서 시작해도 규칙이 지켜져야 한다).
const SAMPLES = Array.from(
  { length: 14 },
  (_, i) => new Date(Date.UTC(2026, 8, 1, 3, 0) + i * 12 * 60 * 60 * 1000),
);

describe('nextSchedule', () => {
  it('항상 지금보다 뒤의 수·토 18:00을 돌려준다', () => {
    for (const now of SAMPLES) {
      const { at, label } = nextSchedule(now, TZ);
      const parts = partsIn(at, TZ);

      expect(at.getTime()).toBeGreaterThan(now.getTime());
      expect(['Wed', 'Sat']).toContain(parts.weekday);
      expect(parts.hour).toBe(18);
      expect(parts.minute).toBe(0);
      expect(label).toBe(`${parts.weekday === 'Wed' ? '수' : '토'} 18:00`);
    }
  });

  it('7일 안에 있다(주마다 두 번이므로)', () => {
    for (const now of SAMPLES) {
      const { at } = nextSchedule(now, TZ);
      expect(at.getTime() - now.getTime()).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('스케줄 정각이면 이미 시작한 것으로 보고 다음 회차를 준다', () => {
    // 어떤 표본에서든 "그 결과 시각"을 now로 다시 넣으면 그다음 회차가 나와야 한다.
    const first = nextSchedule(SAMPLES[0] as Date, TZ);
    const second = nextSchedule(first.at, TZ);

    expect(second.at.getTime()).toBeGreaterThan(first.at.getTime());
    expect(second.label).not.toBe(first.label);
  });

  it('시간대가 다르면 결과도 그 지역 기준이다', () => {
    const now = new Date(Date.UTC(2026, 8, 2, 10, 0));

    const seoul = nextSchedule(now, TZ);
    const utc = nextSchedule(now, 'UTC');

    expect(partsIn(seoul.at, TZ).hour).toBe(18);
    expect(partsIn(utc.at, 'UTC').hour).toBe(18);
    expect(seoul.at.getTime()).not.toBe(utc.at.getTime());
  });
});
