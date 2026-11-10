import { describe, it, expect } from 'vitest';
import { describeApproval, describeRerunPlan, validateInstruction } from './run-action-bar';

const STEPS = [
  { name: 'evidence', label: '근거 수집' },
  { name: 'velog', label: '벨로그 본문' },
  { name: 'verify', label: '근거 검증' },
];

describe('validateInstruction', () => {
  it('공백만이면 입력 요구', () => {
    expect(validateInstruction('   ', 2000)).toBe('수정 지시를 입력해 주세요.');
  });

  it('optional이면 빈 지시도 통과한다(실패 실행의 재실행) — 상한은 그대로', () => {
    expect(validateInstruction('   ', 2000, { optional: true })).toBeNull();
    expect(validateInstruction('가'.repeat(11), 10, { optional: true })).toBe(
      '수정 지시는 10자 이하로 써 주세요.',
    );
  });

  it('상한을 넘으면 길이 안내', () => {
    expect(validateInstruction('가'.repeat(11), 10)).toBe('수정 지시는 10자 이하로 써 주세요.');
  });

  it('정상이면 null — 앞뒤 공백은 세지 않는다', () => {
    expect(validateInstruction('  부드럽게  ', 4)).toBeNull();
  });
});

describe('describeRerunPlan', () => {
  it('다시 도는 단계를 라벨 화살표로, 이전 결과 단계는 가운뎃점으로 잇는다', () => {
    expect(
      describeRerunPlan(
        { startStep: 'velog', fresh: ['velog', 'verify'], carried: ['evidence'], sources: {} },
        STEPS,
      ),
    ).toEqual({ fresh: '벨로그 본문 → 근거 검증', carried: '근거 수집' });
  });

  it('첫 단계부터면 carried는 null', () => {
    expect(
      describeRerunPlan(
        { startStep: 'evidence', fresh: ['evidence', 'velog'], carried: [], sources: {} },
        STEPS,
      ).carried,
    ).toBeNull();
  });

  it('모르는 단계 이름은 그대로 쓴다(화면이 죽지 않는다)', () => {
    expect(
      describeRerunPlan(
        { startStep: 'evidence', fresh: ['evidence', 'weird' as never], carried: [], sources: {} },
        STEPS,
      ).fresh,
    ).toBe('근거 수집 → weird');
  });
});

describe('describeApproval', () => {
  const base = { postsDir: '/blog/posts/my-post', replaced: [], leftover: [] };

  it('첫 승인은 success — posts 폴더만 안내하고 공개 발행이 없음을 밝힌다', () => {
    expect(describeApproval(base)).toEqual({
      tone: 'success',
      title: '승인했습니다. 공개 발행은 일어나지 않았습니다.',
      lines: ['산출물을 썼습니다 → /blog/posts/my-post'],
    });
  });

  it('옮긴 직전 승인 파일은 개수·보관 폴더·이름을 함께 보여 준다', () => {
    const notice = describeApproval({
      ...base,
      replaced: ['old.md', 'old.zenn.md'],
      replacedDir: '/data/replaced/my-post/run1',
    });
    expect(notice.tone).toBe('success');
    expect(notice.lines[1]).toBe(
      '직전 승인 파일 2개를 옮겼습니다 → /data/replaced/my-post/run1: old.md, old.zenn.md',
    );
  });

  it('보관 폴더가 없으면 경로 화살표를 빼고 이름만', () => {
    expect(describeApproval({ ...base, replaced: ['old.md'] }).lines[1]).toBe(
      '직전 승인 파일 1개를 옮겼습니다: old.md',
    );
  });

  it('남은 옛 파일이 있으면 warning — 사람이 정리하라고 안내한다', () => {
    const notice = describeApproval({ ...base, leftover: ['old.md'] });
    expect(notice.tone).toBe('warning');
    expect(notice.lines.at(-1)).toBe(
      'posts 폴더에 옛 파일이 남았습니다(옮기지 못함): old.md — 직접 옮기거나 지우세요.',
    );
  });
});
