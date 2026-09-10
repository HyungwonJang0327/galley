'use client';
import { useRouter } from 'next/navigation';
import { Select } from '@galley/ui';
import { queueHref } from '../../../lib/queue-tabs';

// 후보 탭 카테고리 필터. 선택은 URL(?category=)로만 — 로컬 상태를 두지 않는다.
const ALL = '__all__';

export function CategoryFilter({
  categories,
  value,
}: {
  categories: readonly string[];
  value: string | undefined;
}) {
  const router = useRouter();
  const items = [
    { value: ALL, label: '전체 카테고리' },
    ...categories.map((category) => ({ value: category, label: category })),
  ];

  return (
    <Select
      aria-label="카테고리"
      value={value ?? ALL}
      items={items}
      onValueChange={(next) =>
        router.push(queueHref('candidates', next === ALL ? undefined : next))
      }
    />
  );
}
