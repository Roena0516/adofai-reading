# CLAUDE.md

불과 얼음의 춤(ADOFAI) 커스텀 레벨을 손가락 레인(8레인 건반 리듬게임)으로 펼쳐 보여주고, 자기 타법대로 키보드로
연습하게 해 주는 웹 앱. 사용자는 한국어로 소통하고 UI 문구도 모두 한국어다. 설계와 진행 기록은 `PLAN.md`,
사용법은 `README.md`에 있다.

## 명령

```bash
pnpm install
pnpm dev                 # http://localhost:5199 (vite.config.ts에 고정)
pnpm test                # packages/core 테스트 (vitest)
pnpm lint                # ESLint (flat config)
pnpm typecheck           # 모든 패키지 tsc
pnpm build               # apps/web 정적 빌드 → apps/web/dist
pnpm format              # Prettier
pnpm dump "<레벨.zip>" [--preset basic|outin|stairs|max4|trill] [--notes 40]   # 엔진 결과를 터미널로
```

변경을 마치면 `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 모두 통과시킨다.

## 구조

pnpm 모노레포(pnpm 9). TypeScript는 6.0.3으로 고정한다. typescript-eslint가 TS 7을 지원하지 않는다.

- `packages/core`: 순수 TypeScript 엔진. 브라우저와 Node에서 같이 쓴다. `src/index.ts`가 진입점이다.
  - `parse/`: 관대한 JSON 파서, pathData → angleData, 레벨 설정(`rawSettings` 포함)
  - `timing/`: 타일 각도·BPM·Twirl·미드스핀·Pause·Hold → 노트 시각
  - `rhythm/`: 기준 BPM 구간 감지, 동타 묶기, 연타(run)·비트 분할·강박
  - `fingering/`: 레인 모델, 순서 문자열, 타법 프로필(스키마·마이그레이션), 프리셋, 배정기(`assign.ts`)
  - `track/`: 타일 배치(PositionTrack), MoveTrack·AnimateTrack·색 효과, 카메라 타임라인
  - `practice/`: 레인 단위 판정, 통계
  - `test/`: vitest. `helpers.ts`의 `fakeTiming`, `beats`로 합성 채보를 만든다.
- `apps/web`: React 19, Vite 8, Zustand 5(persist), Tailwind 4, lucide-react
  - `chart/model.ts`: 레벨 + 프로필 + 레벨별 수정 → `ChartModel`(분석, 배정, 트랙, 표시 시각)
  - `render/`: Canvas 렌더러(`laneRenderer`, `trackRenderer`, `timelineRenderer`)
  - `audio/engine.ts`: Web Audio. `getOutputTimestamp`로 실제로 들리는 시각을 기준 시계로 쓴다.
  - `stores/`: `profiles`, `overrides`(레벨별 수정), `settings`, `player`, `practice`, `level`

## 지켜야 하는 규칙

사용자가 실제 레벨 장면을 보고 하나씩 확인해 준 동작이다. 바꾸면 테스트가 깨지거나 사용자가 바로 알아챈다.

### 타이밍

- 오프셋: `tiles[0].time = offset − 60 / bpm0`. offset은 행성이 0°를 지나는 시각이다. 음원 onset 상관으로
  검증했다(Flower Rocket −136ms → −6ms).
- 회전 = (들어온 방향 − 나갈 각도) mod 360, Twirl로 방향을 뒤집는다. 180° = 1박, 0에 가까우면 360.
  미드스핀(999)은 회전 0이고 그다음 노트를 건너뛴다.
- 기준 BPM 구간은 타일 BPM 비율이 아니라 노트 간격 격자의 규칙성으로 찾는다.

### 동타

- 급회전(기본 30° 이하, 15°·30° 동타)은 한 손 동타다.
- 16비트 이상 질주 안에서 주변 간격의 0.6배 이하로 들어오는 90° 이하 쌍도 한 손 동작(`spread`)이다.
  "동타 동시 표시"를 켜도 이 쌍은 실제 시각대로 그린다.

### 손가락 배정 (`fingering/assign.ts`)

- 레인은 항상 8개다. 1 L소, 2 L약, 3 L중, 4 L검, 5 R검, 6 R중, 7 R약, 8 R소이고 코드에서는 0부터 센다.
- 기본(단순 모드)은 비트별 키 수다. 4비트 이하 1키, 8비트 양손 트릴(54), 16비트 4키(5643), 24비트 6키(567432),
  32비트 이상 8키(56784321). 안밖은 각 손이 검지에서 바깥으로 구른다는 뜻이다.
- 순서는 손 묶음으로 본다(5643 → R[5,6] L[4,3]). 노트 하나가 한 칸이다. 한손 동타는 그 손의 다음 손가락까지 함께
  쓰고, 같은 손의 다음 노트는 바깥으로 밀린다(5+6, 7 | 4 3).
- 0.5박 이하의 쉼은 같은 흐름이고 쉼표도 한 칸을 차지한다. 그래서 "동타, 16분 쉼, 단타, 단타"는
  5+6 · 4 3 · 5+6 · 4 3이 된다.
- 흐름의 첫 연타는 강박에 첫 손가락(5)이 오게 시작한다. 그래서 약박에서 시작하는 트릴은 왼손부터 친다.
- 이후 연타는 쉼이나 순서가 바뀌는 지점에서만 시작 위치를 다시 고른다. 기준은 `COST` 비용이다.
  - 검지로 시작하지 않는 동타(중약 동타)
  - 주손이 아닌 손의 동타. 연타 앞부분의 동타일수록 무겁게 본다.
  - 동타 없는 연타에서 강박에 5가 오지 않는 경우
  - 손별로 같은 손가락을 150ms 안에 다시 치는 경우
  - 쉼 하나를 사이에 두고 같은 손이 또 치는 경우

  앞으로 4박 안에 시작하는 연타까지 보고 고르고, 긴 연타의 끝부분은 시작 손에 영향을 주지 않는다.

- Flower Rocket의 #680, #734, #795, #1057, #1626 장면이 기준이다. 해당 패턴은 `test/fingering.test.ts`에 있다.
  배정을 바꾸면 테스트와 함께 실제 레벨 결과도 확인한다(`pnpm dump`나 직접 쓴 스크립트).

### 타법 프로필 스키마

- `profile.version`은 현재 4다. 마이그레이션은 `normalizeProfile`(`fingering/profile.ts`)에서 한다.
- 사용자의 프로필은 브라우저 로컬스토리지에 있다. 기본값이나 의미를 바꾸면 버전을 올리고 마이그레이션을 추가한다.

### 얼불춤 화면 (`track/`, `render/trackRenderer.ts`)

- 타일은 두께 0.58의 다각형이고 모서리는 각지게 잇는다. 두 팔 사이 각이 50° 미만이면 뒤를 둥글게 한다.
- 나중 타일을 먼저 그려서 앞 타일이 위에 오게 한다. 줌 100%에서 화면 높이에 약 6.5타일이 들어간다.
- 장식(AddDecoration 등)은 그리지 않는다. 카메라 이동, MoveTrack, AnimateTrack, 트랙 색은 적용한다.
- 행성과 카메라는 착지하는 순간의 타일 위치(MoveTrack 이동 포함)에 선다. `stickToFloors`는 착지한 뒤에도
  타일을 따라갈지만 정한다.
- 나타나기 애니메이션은 자신이 다루는 값을 원래대로 돌린다. Extend·Grow는 크기, Fade는 투명도,
  Assemble·Drop·Rise·Scatter는 위치다. 미리 크기 0이나 투명도 0으로 숨긴 타일이 이렇게 나타난다.
  그 순간 진행 중인 MoveTrack이 있으면 그 값은 건드리지 않는다.

## 웹 앱 메모

- 로컬스토리지 키는 `adofai-reading:profiles`, `adofai-reading:overrides`, `adofai-reading:settings`다.
  노트 직접 수정은 레벨 해시별로 `floor → 0부터 센 레인`으로 저장된다. 레벨 JSON 내보내기와 가져오기는
  `chart/levelFile.ts`에 있다.
- 개발 모드에서는 `window.__adofai`(`engine`, `useLevel`, `usePlayer`, `useProfiles`, `useSettings`, `model`)로
  상태를 읽고 조작할 수 있다. 브라우저 확인에 쓴다.
- 디자인은 team-carol/carol-web 토큰(`styles.css`, Pretendard, 코랄 강조색)을 따른다.
- Tailwind 색 토큰 이름이 유틸리티와 겹치면 안 된다. `--color-right`가 `text-right`를 깨뜨려서 손 색은
  `--color-hand-l/r`로 쓴다.

## 작업 방식

- 사용자가 `pnpm dev`(5199)를 직접 띄워 둔다. 그 서버를 끄거나 다시 띄우지 말고 HMR로 확인한다.
- 브라우저로 확인할 때 localhost:5199의 로컬스토리지를 지우지 않는다. 사용자의 프로필과 노트 수정이 들어 있다.
  확인용으로 값을 바꿨다면 원래 값으로 되돌린다.
- 테스트 레벨 `Flower Rocket.zip`, `MEGAMIX.zip`은 프로젝트 루트에 두고 쓴다. 음원이 들어 있어서 git에 올리지
  않는다(`.gitignore`의 `*.zip`). 파일이 있으면 fixture 테스트가 돌고, 없으면 건너뛴다.
- 사용자가 요청할 때만 커밋하고 푸시한다.
