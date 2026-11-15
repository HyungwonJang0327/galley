# disabled 표현 — 흐린 색으로 통일 (RF-26)

## 결정

galley-ui의 비활성(disabled) 표현은 **토큰 색으로만** 만든다 — 글자 `--ui-color-text-muted`, 채움 `--ui-color-bg`, 테두리 `--ui-color-border`, `cursor: not-allowed`. **`opacity`로 흐리게 하지 않는다**(둘을 겹치지도 않는다). Button은 variant와 무관하게 disabled면 같은 회색 모양이 된다(ghost만 채움·테두리 없음 유지).

## 이유

- 비활성도 읽혀야 한다. 색이 토큰이면 대비가 테마마다 하나로 정해진다(라이트 `#6b7280`/`#fff` 4.8:1). opacity는 아래에 무엇이 깔리든 결과가 달라져 다크·카드 밖·강제 색상에서 예측이 안 된다.
- 강제 색상 모드(decisions/forced-colors.md)에서 muted는 GrayText로 바뀐다. 그 위에 opacity가 얹히면 시스템 색이 다시 흐려지고, `forced-color-adjust: none`을 둔 primary·danger 채움은 반투명 Highlight로 남는다 — P7g 감사가 비켜 간 구멍이다.
- 2026-11-15 실측: 이미 필드(Input·Textarea·Select 트리거)·Checkbox·Radio·Switch·Menu·Select 항목·FormField 라벨은 muted 색이었고, Button만 opacity, Tabs·Pagination은 둘을 겹쳤다. 다수 쪽으로 맞춘다.
- 중첩된 요소(라벨 안의 박스·아이콘)에 opacity가 각각 걸리면 곱해져 더 흐려진다. 색은 겹쳐도 그대로다.

## 기각된 대안

- **opacity 0.5로 통일** — 코드가 짧고 variant 정체(파란 버튼이었다)가 남지만, 필드 placeholder·테두리가 반쯤 사라지고 중첩·다크·강제 색상에서 대비가 흔들린다.
- **현행 유지 + 규칙 문서화**("모양 유지 컨트롤은 muted, 액션은 opacity") — 두 관례가 남고 Button의 강제 색상 반투명 문제가 그대로.

## 배포 시 변화

- 앱의 disabled 버튼 전부 모양이 바뀐다(primary·danger도 회색). 기능 변화 없음. patch.

## 결정일

2026-11-15 (사용자 "둘 다 A로 가자", RF-26 — 2026-09-21 RF1에서 보류한 항목)

## 갱신 이력

- 2026-11-15 최초 결정.
