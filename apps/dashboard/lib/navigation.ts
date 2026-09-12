// 사이드바 메뉴의 단일 정의(라벨·경로·아이콘·배지). decisions/navigation.md 기준.
// 사용 흐름 순: 주제(큐) → 실행 → 발행 → 설정. 상태(대기/후보/보류/완료 등)는
// 화면 안 탭(?tab=)이라 메뉴에 두지 않는다.
import {
  LayoutDashboard,
  Inbox,
  Play,
  History,
  Send,
  FolderGit2,
  Coins,
  MessageSquareText,
  ExternalLink,
  Component,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 우측 배지(대기 n·승인 대기 n·미발행 n). 값은 데이터 소스 준비 시 주입. */
  badge?: string | number;
  /** 외부 링크(새 탭). 활성 판정 제외. */
  external?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * 사이드바 맨 위 단독 항목(그룹 없음). 홈은 정보 종류가 아니라 시작점이라 그룹에 넣지 않는다
 * — decisions/navigation.md. 아래 구분선은 Sidebar가 그린다.
 */
export const HOME_ITEM: NavItem = { label: '홈', href: '/', icon: LayoutDashboard };

const BASE_GROUPS: NavGroup[] = [
  {
    label: '주제',
    items: [{ label: '큐', href: '/queue', icon: Inbox }],
  },
  {
    label: '실행',
    items: [
      { label: '실행', href: '/runs', icon: Play },
      { label: '이력', href: '/runs/history', icon: History },
    ],
  },
  {
    label: '발행',
    items: [{ label: '발행 대기', href: '/publish', icon: Send }],
  },
  {
    label: '설정',
    items: [
      { label: '리포 연결', href: '/settings/repos', icon: FolderGit2 },
      { label: '모델·비용', href: '/settings/model', icon: Coins },
      { label: '어투 프롬프트', href: '/settings/prompts', icon: MessageSquareText },
    ],
  },
  {
    label: '외부',
    items: [
      { label: 'Zenn 열기', href: 'https://zenn.dev', icon: ExternalLink, external: true },
      { label: 'velog 열기', href: 'https://velog.io', icon: ExternalLink, external: true },
    ],
  },
];

// 개발 보조 갤러리는 개발 서버에서만 노출. process.env.NODE_ENV는 Next가 빌드 시
// 정적 치환하므로 프로덕션 빌드에선 이 그룹이 번들에서 제거된다(배포 대비).
const DEV_GROUPS: NavGroup[] =
  process.env.NODE_ENV === 'development'
    ? [{ label: '개발', items: [{ label: '컴포넌트 갤러리', href: '/design', icon: Component }] }]
    : [];

export const NAV_GROUPS: NavGroup[] = [...BASE_GROUPS, ...DEV_GROUPS];

/** 활성 판정은 URL(pathname) 기준. 외부 링크는 항상 비활성. */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  return pathname === item.href;
}
