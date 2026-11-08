# 워커 설치 (macOS launchd)

Galley의 파이프라인은 대시보드가 아니라 **별도 워커 프로세스**가 실행한다(decisions/run-location.md). 터미널에서 `pnpm --filter @galley/pipeline worker`로 띄워도 되지만, 로그인할 때 자동으로 뜨고 죽으면 다시 뜨게 하려면 launchd에 등록한다. 이 문서는 그 절차다. 설치 스크립트는 없다 — 경로 세 개를 손으로 바꾸는 편이 무엇이 어디에 있는지 분명하다.

## 전제

- **Node 24** (`node -v`). 워커는 빌드 없이 `node bin/worker.ts`로 돈다(decisions/node-runtime.md). launchd는 셸 PATH를 모르므로 **Node 실행 파일의 절대경로**가 필요하다: `which node` (nvm이면 `~/.nvm/versions/node/v24.x.x/bin/node`).
- 리포 루트 `.env` 하나(decisions/env-location.md). 워커가 기동할 때 검사하는 값:
  - `DATABASE_URL` — 대시보드와 같은 SQLite. `pnpm --filter @galley/pipeline db migrate deploy`가 끝나 있어야 한다.
  - `DATA_DIR` — **절대경로**, `BLOG_DIR` 밖. 비었거나 상대경로·`~`·BLOG_DIR 안이면 기동을 거부한다.
  - `PROMPTS_DIR`(선택) — 적으면 절대경로여야 한다.
  - `ANTHROPIC_API_KEY`·`OPENAI_API_KEY` — 키가 없는 provider의 모델은 실행이 `MODEL_UNAVAILABLE`로 실패한다.
  - `GALLEY_CHROME`(선택) — 썸네일용 Chrome 절대경로. 없으면 OS 기본 경로를 찾고, 못 찾으면 발행정보 단계만 실패한다(기동은 한다).
- `.galley/redact.json`(식별 정보 필터). 없으면 기동은 하지만 읽기 전용 리포의 인덱싱·근거 수집을 거부한다. 깨져 있으면 기동하지 않는다.
- `NODE_ENV`를 **설정하지 않는다.** `test`·`development`면 Mock 단계 러너로 돌아 실제 모델을 부르지 않는다.

먼저 터미널에서 한 번 띄워 기동 로그(`단계 러너: 실제`, `availableModels`)를 확인하고 나서 등록하는 편이 빠르다.

## 설치

1. 로그 폴더를 만든다.

   ```bash
   mkdir -p ~/Library/Logs/galley
   ```

2. 템플릿을 복사하면서 자리 네 개를 바꾼다. `__REPO__`는 리포 절대경로, `__NODE__`는 `which node` 결과, `__NODE_DIR__`은 그 파일이 든 폴더(PATH용), `__HOME__`은 홈 폴더다.

   ```bash
   REPO="$HOME/Desktop/projects/Galley"   # 자기 경로로
   NODE="$(which node)"                   # Node 24여야 한다
   sed -e "s|__REPO__|$REPO|g" \
       -e "s|__NODE_DIR__|$(dirname "$NODE")|g" \
       -e "s|__NODE__|$NODE|g" \
       -e "s|__HOME__|$HOME|g" \
       "$REPO/docs/com.galley.worker.plist" > ~/Library/LaunchAgents/com.galley.worker.plist
   plutil -lint ~/Library/LaunchAgents/com.galley.worker.plist
   ```

3. 등록하고 띄운다(현재 로그인 세션 = `gui/<uid>`).

   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.galley.worker.plist
   launchctl print gui/$(id -u)/com.galley.worker | grep -E "state|pid"
   ```

4. 확인한다.
   - `tail -f ~/Library/Logs/galley/worker.out.log` 에 `{"level":"info","message":"워커 시작", ...}`와 `단계 러너: 실제`가 보인다.
   - 대시보드 TopBar 우측 **워커 생존 점**이 초록이다(5초마다 heartbeat, 30초 공백이면 회색).
   - `worker.err.log`에 `기동하지 않는다`가 반복되면 `.env`·`.galley/*.json`을 고친다 — KeepAlive가 10초마다 다시 띄우므로 고칠 때까지 같은 줄이 쌓인다.

## 운영

- **중지 / 재시작**

  ```bash
  launchctl kill SIGTERM gui/$(id -u)/com.galley.worker   # 돌던 단계를 반환하고 종료 → KeepAlive가 다시 띄운다
  launchctl kickstart -k gui/$(id -u)/com.galley.worker    # 코드를 pull한 뒤 새 코드로 재시작
  ```

  SIGTERM은 중단이 아니라 **반환**이다: 돌던 단계 산출물을 버리고 실행을 `interrupted`로 되돌린 뒤 나가며, 다음 기동이 바로 이어 잡는다(decisions/run-execution-model.md §3). 시도 횟수에 세지 않는다.

- **제거**

  ```bash
  launchctl bootout gui/$(id -u)/com.galley.worker
  rm ~/Library/LaunchAgents/com.galley.worker.plist
  ```

- **로그**: `~/Library/Logs/galley/worker.{out,err}.log`. 워커 로그는 JSON 한 줄씩이고 사람에게 보여 줄 문장이 아니다(decisions/error-handling.md). 토큰·비용 같은 구조화된 결과는 파일이 아니라 DB(RunStep)에 있고 실행 상세 화면이 보여 준다. 로그 파일은 launchd가 자르지 않으므로 커지면 직접 비운다(`: > worker.out.log`).

- **.env를 바꿨으면** 재시작해야 반영된다(`kickstart -k`). `--env-file`은 기동 때 한 번 읽는다.

## 잠자기 · 재부팅

**잠자기 방지는 하지 않는다**(decisions/run-location.md). 맥이 잠들면 워커도 멈추고, 깨어나면 그대로 이어서 돈다. 단계 도중 30초 넘게 heartbeat가 끊긴 실행은 `interrupted`로 바뀌고 **완료된 단계 다음부터** 다시 돈다 — 잠자기·재부팅·강제 종료를 구분하지 않는다. 로그인하면 `RunAtLoad`로 다시 뜬다(로그인 전에는 돌지 않는다 — LaunchDaemon이 아니라 LaunchAgent다. 사용자 폴더·키체인 없이 돌 이유가 없고 `.env`도 사용자 폴더에 있다).

## 다른 OS

Linux면 같은 명령(`node --env-file=<repo>/.env bin/worker.ts`, `WorkingDirectory=<repo>/packages/pipeline`)을 systemd user 서비스(`Restart=always`)로 두면 된다. 워커 코드는 그대로다(run-location.md "다른 환경").
