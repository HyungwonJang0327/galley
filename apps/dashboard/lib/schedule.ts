// 다음 자동 실행 시각(수·토 18:00 중 가까운 쪽) 계산·표시. 스케줄 자체는 기존 blog 쪽이 소유하고
// Galley는 표시만 한다(decisions/ondemand-execution.md) — 그래서 pipeline이 아니라 앱 유틸이다.
// 시간대는 인자로 받는다(하드코딩 금지, .env TZ). Asia/Seoul은 DST가 없어 분 단위 가산으로 충분하다.

/** 0=일 … 6=토. 수·토 18:00. */
const SCHEDULE_DAYS = [3, 6] as const;
const SCHEDULE_HOUR = 18;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface NextSchedule {
  /** 다음 실행 시각(UTC 기준 Date). */
  at: Date;
  /** 표시용 "수 18:00". */
  label: string;
}

/** 주어진 시간대에서의 요일·시·분. */
function zonedParts(
  date: Date,
  timeZone: string,
): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  return {
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    // Intl은 자정을 '24'로 줄 수 있다.
    hour: hour === 24 ? 0 : hour,
    minute: Number(get('minute')),
  };
}

/**
 * now 이후 가장 가까운 수·토 18:00. 정각이면 "이미 시작한 것"으로 보고 다음 회차를 돌려준다.
 */
export function nextSchedule(now: Date, timeZone: string): NextSchedule {
  const { weekday, hour, minute } = zonedParts(now, timeZone);
  const nowMinutes = hour * 60 + minute;

  for (let offset = 0; offset <= 7; offset++) {
    const day = (weekday + offset) % 7;
    if (!SCHEDULE_DAYS.includes(day as (typeof SCHEDULE_DAYS)[number])) continue;
    const minutesUntil = offset * 24 * 60 + SCHEDULE_HOUR * 60 - nowMinutes;
    if (minutesUntil <= 0) continue;
    return {
      at: new Date(now.getTime() + minutesUntil * 60_000),
      label: `${DAY_LABELS[day]} ${SCHEDULE_HOUR}:00`,
    };
  }
  // 위 반복은 7일 안에 반드시 하나를 찾는다(수·토가 주마다 있으므로).
  throw new Error('다음 스케줄을 찾지 못했습니다.');
}
