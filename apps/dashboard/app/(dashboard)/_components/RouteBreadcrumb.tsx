import Link from 'next/link';
import { Breadcrumb } from 'galley-ui';
import { breadcrumbFor } from '../../../lib/navigation';

// 경로 표시 — 메뉴 정의(lib/navigation)에서 항목을 만들고 링크는 Next Link를 render로 넘긴다(ui는 라우터를 모른다).
// PageHeader의 eyebrow에 둔다. 메뉴에 없는 경로면 아무것도 그리지 않는다.
export function RouteBreadcrumb({ pathname }: { pathname: string }) {
  const crumbs = breadcrumbFor(pathname);
  if (crumbs.length === 0) return null;
  return (
    <Breadcrumb
      aria-label="현재 위치"
      items={crumbs.map((crumb) => ({
        label: crumb.label,
        ...(crumb.href === undefined ? {} : { render: <Link href={crumb.href} /> }),
      }))}
    />
  );
}
