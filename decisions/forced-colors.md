# 강제 색상 모드(forced-colors): 토큰 재정의 + 구조 보정

## 결정

Windows 고대비 같은 **강제 색상 모드**는 세 겹으로 대응한다.

1. **토큰 한 곳**: `tokens.css`의 `@media (forced-colors: active)`에서 색 토큰(`--ui-color-*`)을 시스템 색으로 재정의한다 — 표면·배경 `Canvas`, 글자·경계선 `CanvasText`, 보조 `GrayText`, accent·틴트·danger 채움 `Highlight`, 그 위 글자 `HighlightText`. 라이트·다크 선택자 둘 다. 브라우저는 저자 색을 덮어쓰지만 **시스템 색 키워드는 살려 두고, `var()`를 거쳐도 그렇다**(2026-11-14 실측). 토큰만 쓰는 컴포넌트는 손대지 않아도 켜짐·선택·현재가 돌아온다.
2. **글자 있는 Highlight 채움은 `forced-color-adjust: none`**: primary·danger 버튼, Pagination 현재 쪽, Table 선택 행, ListRow 활성, SidebarItem 활성, Menu·Select 강조 항목, TopBarChip 활성. 브라우저가 저자 배경 뒤에 Canvas 백플레이트를 깔아 HighlightText 글자가 검은 네모로 묻힌다(실측). 끄더라도 그 요소의 색은 전부 토큰 = 시스템 색이라 테마를 따른다.
3. **색으로 못 푸는 구조만 컴포넌트 블록**: 투명 밑줄이 CanvasText로 드러나므로 Tabs·ListToolbarTab 비활성은 밑줄 두께를 0으로 하고 패딩으로 채운다. 배경만으로 모양을 내던 Badge·Avatar·TopBarChip·InlineAlert(filled)과 그림자뿐이던 Dialog·Tooltip은 `outline: 1px solid CanvasText`. Skeleton은 `GrayText`, Badge 펄스 점은 `CanvasText`, TimelineItem 대기 마커는 속을 비운다.

검증은 수동 DevTools가 아니라 **실측 스크립트**(`apps/dashboard/scripts/verify-layout/forced-colors.mjs`)가 CDP `Emulation.setEmulatedMedia`로 모드를 켜고 갤러리에서 잰다 — CI `layout` 잡에 포함.

## 이유

- 토큰이 단일 출처라는 원칙(tokens.css)과 맞고, 컴포넌트 36개에 블록을 흩지 않는다. reduced-motion도 같은 방식.
- 실측으로 확인한 사실에만 맞췄다: 투명 테두리가 보이게 된다 · 배경은 Canvas로 덮인다 · 시스템 색은 var 경유로도 살아남는다 · 저자 배경 뒤 백플레이트.
- 검증을 스크립트로 두어야 다음 컴포넌트가 깨뜨려도 CI가 잡는다.

## 기각된 대안

- **컴포넌트마다 `@media` 블록으로 색을 다시 지정**: 같은 규칙을 36번 쓴다. 0.1.0 Separator가 이 방식이었고 그대로 두되(이미 CanvasText) 확장하지 않는다.
- **`forced-color-adjust: none`을 넓게 걸고 토큰만 믿기**: 글자 백플레이트·링크 색·포커스 링 같은 브라우저 보정까지 잃는다. 의도한 Highlight 채움에만 좁게.
- **현행 유지(미검증 문구)**: 2026-09-17 결정이었고, P7g에서 검증 수단이 생겨 해제.

## 배포 시 변화

galley-ui patch. 소비자 쪽 변경 없음.

## 결정일

2026-11-14

## 갱신 이력

- 2026-11-14 최초 결정(P7g). README 접근성 절 "미검증" 문구 제거.
