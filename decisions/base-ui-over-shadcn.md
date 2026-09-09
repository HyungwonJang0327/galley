# UI 기반: Base UI (shadcn/ui 기각)

## 결정

`@galley/ui`는 Base UI(헤드리스) 위에 자체 토큰·스타일·컴포넌트 API로 구축한다. shadcn/ui는 쓰지 않는다.

- Base UI 사용: Tabs, Dialog/Sheet, Menu, Select, Checkbox, Tooltip, Popover.
- 직접 작성: Button, Badge, Card, Sidebar 그룹/항목, TopBar 칩, 타임라인 항목.

## 이유

- 디자인 시스템을 **직접 소유**해야 독립 배포·포트폴리오 가치가 산다.
- Base UI는 접근성·상호작용만 제공(헤드리스) → 스타일·API를 우리가 설계.

## 기각된 대안

- **shadcn/ui**: 복붙 기반이라 소유·독립 배포 서사가 약하고, Tailwind 결합이 소비자 부담(→ ui-style).
- **완전 자체 구현(헤드리스도 직접)**: 포커스 트랩·키보드 내비 등 접근성 재구현 비용 과다.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-09 **패키지명 변경 반영**: 설치는 `@base-ui/react` 1.8.0(정확 핀, `@galley/ui` dependencies + Vite external). 구 `@base-ui-components/react`는 1.0.0-rc.0에서 정지. 서브패스 import(`@base-ui/react/dialog`·`/select`). 첫 프리미티브 Dialog·Select(UM1). lucide-react 1.43.0 같이 설치.
