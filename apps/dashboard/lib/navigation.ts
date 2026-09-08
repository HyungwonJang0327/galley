// 사이드바 메뉴의 단일 정의(라벨·경로·아이콘). 스펙 §3 기준.
// Phase 1 구현 화면 = 주제 3 + 실행 2. 나머지는 메뉴에 두되 Phase 2 자리 페이지(A3c).
import {
  Inbox,
  Lightbulb,
  CheckCircle2,
  History,
  Activity,
  FileText,
  PenLine,
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
  /** 외부 링크(새 탭). 활성 판정 제외. */
  external?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const BASE_GROUPS: NavGroup[] = [
  {
    label: '주제',
    items: [
      { label: '큐', href: '/queue', icon: Inbox },
      { label: '후보', href: '/queue/candidates', icon: Lightbulb },
      { label: '완료', href: '/queue/done', icon: CheckCircle2 },
    ],
  },
  {
    label: '실행',
    items: [
      { label: '실행 이력', href: '/runs', icon: History },
      { label: '진행 중', href: '/runs/active', icon: Activity },
    ],
  },
  {
    label: '발행',
    items: [
      { label: 'Zenn 下書き', href: '/publish/zenn', icon: FileText },
      { label: '벨로그 대기', href: '/publish/velog', icon: PenLine },
    ],
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
