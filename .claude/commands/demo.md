---
description: 데모·발표용 시나리오를 demo-script.md에 작성한다 (면접 시연용 기본 흐름)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '[주제]'
---

`demo-script.md`에 데모 시나리오를 쓴다.

**기본 흐름**: 큐에 주제 추가 → 실행 → 타임라인(5단계) → 수정 지시(해당 단계 재실행) → 승인 → Zenn 下書き 확인.

포함:

- **사전 준비 체크리스트** (.env 경로·키, zenn-content 연결, 샘플 주제, 모델 선택).
- **시연 순서** (화면·클릭·기대 결과).
- **실패 대비 플랜 B** (모델 API 실패·네트워크·긴 실행 시간 대응, 준비된 스크린샷/녹화).

`$ARGUMENTS`가 있으면 그 주제로 시나리오를 맞춘다. 공개 발행은 시연에서도 하지 않는다(下書き까지만).
