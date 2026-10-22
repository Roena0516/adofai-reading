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
pnpm dump "<레벨.zip>" [--base 2|4] [--style inout|outin|stairs] [--notes 40]   # 엔진 결과를 터미널로
```

변경을 마치면 `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 모두 통과시킨다.

배포는 Vercel 프로젝트 `adofai-reading`(https://adofai-reading.vercel.app)이다. `vercel.json`이 pnpm으로 설치·빌드하고
`apps/web/dist`를 내보낸다. CLI로 올리므로 `.vercelignore`가 테스트 레벨 zip과 `.env*`를 막는다.
배포 명령은 `npx vercel@latest deploy --prod`이고, 사용자가 요청할 때만 한다.

## 구조

pnpm 모노레포(pnpm 9). TypeScript는 6.0.3으로 고정한다. typescript-eslint가 TS 7을 지원하지 않는다.

- `packages/core`: 순수 TypeScript 엔진. 브라우저와 Node에서 같이 쓴다. `src/index.ts`가 진입점이다.
  - `parse/`: 관대한 JSON 파서, pathData → angleData, 레벨 설정(`rawSettings` 포함)
  - `timing/`: 타일 각도·BPM·Twirl·미드스핀·Pause·Hold → 노트 시각
  - `rhythm/`: 기준 BPM 구간 감지, 동타 묶기, 연타(run)·비트 분할·강박
  - `fingering/`: 레인 모델, 순서 문자열, 타법 프로필(스키마·마이그레이션), 기반별 키 수(`presets.ts`), 배정기(`assign.ts`)
  - `track/`: 타일 배치(PositionTrack), MoveTrack·AnimateTrack·색 효과, 카메라 타임라인,
    RepeatEvents 펼치기(`events.ts`), 화면 효과(`vfx.ts`), 장식(`decorations.ts`)
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
  두 가지 모양이 있다. 90°/270°처럼 격자가 반 칸 밀리는 쌍, 그리고 90°·90°처럼 한 칸 안에 음이 하나 끼고 다음 음이
  격자로 돌아오는 쌍(Flower Rocket #1720 따다닥)이다. 질주 간격은 쌍 간격의 1.5배 이상인 주변 간격들의 중앙값으로
  잡는다. "동타 동시 표시"를 켜도 이 쌍은 실제 시각대로 그린다.

### 손가락 배정 (`fingering/assign.ts`)

- 레인은 항상 8개다. 1 L소, 2 L약, 3 L중, 4 L검, 5 R검, 6 R중, 7 R약, 8 R소이고 코드에서는 0부터 센다.
- 기본(단순 모드)은 기반(`simple.base`)별 키 수 표(`BASE_TIERS`)를 쓴다.
  - 2키 기반: 8비트 이하 1키, 12·16비트 양손 트릴(54), 24비트 3키(564), 32비트 이상 4키(5643)
  - 4키 기반: 4비트 이하 1키, 8비트 트릴, 12비트 3키, 16비트 4키(5643), 24비트 6키(567432), 32비트 이상 8키
  - 4키 기반의 12비트(셋잇단)는 3키라서 박마다 같은 손가락(5)으로 시작한다. 2키 기반은 사용자가 정한 대로 12비트도 트릴이다. 사용자는 2키 기반으로 두 레벨을 확인했다.
  - 레벨별 `bases` 전환("#번호부터 n키 기반")은 그 타일 이후 연타에 적용되고, 결과의 `runBase`에 남는다.
  - 안밖은 각 손이 검지에서 바깥으로 구른다는 뜻이다.
- 순서는 손 묶음으로 본다(5643 → R[5,6] L[4,3]). 노트 하나가 한 칸이다. 한손 동타는 그 손의 다음 손가락까지 함께
  쓰고, 같은 손의 다음 노트(같은 손에 오는 따닥 포함)는 바깥으로 밀린다(5+6, 7 | 4 3, 5+6 · 7+8).
  안쪽으로 구르는 손(밖안 각 손, 계단의 반대 손)은 그 손 차례의 노트가 손가락보다 많을 때 바깥 손가락을 앞에 붙여
  바깥부터 친다(밖안 7+6 5 · 2+3 4). 동타만 있는 차례는 자기 두 손가락을 쓴다(6+5, 3+4). 밖안의 손가락 하나짜리
  순서(2키)도 바깥부터 친다(6+5).
- 0.5박 이하의 쉼은 같은 흐름이고 쉼표도 한 칸을 차지한다. 그래서 "동타, 16분 쉼, 단타, 단타"는
  5+6 · 4 3 · 5+6 · 4 3이 된다.
- 흐름의 첫 연타는 강박에 첫 손가락(5)이 오게 시작한다. 그래서 약박에서 시작하는 트릴은 왼손부터 친다.
- 이후 연타는 쉼이나 순서가 바뀌는 지점에서만 시작 위치를 다시 고른다. 기준은 `COST` 비용이다.
  - 검지로 시작하지 않는 동타(중약 동타)
  - 주손이 아닌 손의 동타. 연타 앞부분의 동타일수록 무겁게 본다.
  - 동타 없는 연타에서 강박에 5가 오지 않는 경우
  - 같은 손가락을, 그 순서가 원래 돌아오는 간격(예: 5643 32분이면 32분 4개)보다, 그리고 150ms보다 빨리 다시
    치는 경우. 간격은 동작이 시작된 시각으로 잰다(동타 6+5의 5도 동타 시작 시각). 그래서 2키의 5 · 5나 32분 4키 롤,
    밖안 6+5 · 5는 벌점이 없다. 흐름 첫 연타의 "방금 친 손가락으로 시작하지 않기"도 같은 기준이다.
  - 연타를 "한 손가락 옆"에서 시작하는 후보(4키의 4 대신 3)는 그 연타의 순서에 있는 손가락일 때만 쓴다. 2키(54)에서
    정박을 중지로 치는 일은 없다(Flower Rocket #1808, #2459, 밖안 2키).
  - 쉼 하나를 사이에 두고 같은 손이 또 치는 경우
  - 바로 앞 연타와 리듬 모양(노트·동타·간격·박 위치)이 같은데 다르게 치는 경우. 다가닥 다가닥은 매번 같은
    배치다(2키: 5 4 5+6 · 5 4 5+6).

  앞으로 4박 안에 시작하는 연타까지 보고 고르고, 긴 연타의 끝부분은 시작 손에 영향을 주지 않는다.

- Flower Rocket의 #680, #734, #795, #1057, #1626 장면이 기준이다. 해당 패턴은 `test/fingering.test.ts`에 있다.
  배정을 바꾸면 테스트와 함께 실제 레벨 결과도 확인한다(`pnpm dump`나 직접 쓴 스크립트).

### 타법 프로필 스키마

- `profile.version`은 현재 5다. 마이그레이션은 `normalizeProfile`(`fingering/profile.ts`)에서 한다. v5에서 비트별 키 수(`tiers`)가 기반(`base`)으로 바뀌었고(16비트가 2키였으면 2키 기반), 직접 편집 순서(custom)는 앱에서 더 이상 고를 수 없어 단순 모드로 돌린다.
- 타법 탭은 기준 BPM(재생 위치 구간, ×2·÷2, 구간 탭과 같은 레벨 수정), 주손, 굴리는 방향, 기반, 키 바인딩, 동타만 보여 준다. 사이드바는 오른쪽 가장자리 가운데 탭으로 닫고 연다. 프로필 관리와 고급 설정(직접 편집, 연타 규칙, 판정)은 사용자가 빼 달라고 했다.
- 사용자의 프로필은 브라우저 로컬스토리지에 있다. 기본값이나 의미를 바꾸면 버전을 올리고 마이그레이션을 추가한다.

### 얼불춤 화면 (`track/`, `render/trackRenderer.ts`)

- 타일은 두께 0.58의 다각형이고 모서리는 각지게 잇는다. 두 팔 사이 각이 70° 미만(15°~60° 타일)이면 뒤를
  둥글게 한다. 60°는 사용자가 둥글다고 확인했다. 75°는 아직 각지게 둔다(확인 전).
- 나중 타일을 먼저 그려서 앞 타일이 위에 오게 한다. 줌 100%에서 화면 높이에 약 6.5타일이 들어간다.
- 카메라 이동, MoveTrack, AnimateTrack, 트랙 색을 적용한다. 시간에 따라 바뀌는 효과는 모두
  `levelEvents(level)`를 읽는다. 여기서 RepeatEvents를 펼친다. eventTag가 붙은 이벤트는 같은 타일의
  RepeatEvents가 그 태그를 반복할 때만 실행한다. 나머지는 판정(SetConditionalEvents)이나 장식 히트박스가
  부를 때만 실행되는 것으로 보고 뺀다. 근거는 Timeline의 1번 타일 "유다희" 죽음 연출과 "뿌슝빠슝" 이벤트,
  그리고 Feral이 태그 "none"으로 이벤트를 끄는 방식이다. 반복하는 RepeatEvents가 모두
  executeOnCurrentFloor: false면 원래 시각에는 실행하지 않고 반복분만 실행한다. CustomBackground의 크기는
  `scalingRatio`(새 레벨)나 `unscaledSize`다. Compression 필터는 옅은 블록만 남긴다.
- 화면 효과(`buildVfx`)는 배경(CustomBackground), 플래시, 화면 흔들림, 블룸, 필터(SetFilter),
  행성 회전 이징(SetPlanetRotation)이다. 플래시는 끝난 뒤에도 끝 색을 유지한다.
- 필터와 블룸은 `render/postfx.ts`의 WebGL 셰이더 한 장으로 2D 프레임 위에 덧그린다. 게임 셰이더의
  근사치다. 모르는 필터는 비슷한 것으로 대신하거나(`ALIASES`) 무시한다. SetFilterAdvanced는 지원하지 않는다.
  셰이더의 픽셀 단위(눈 입자, 주사선, LED 칸)는 CSS 픽셀이다. Neon은 평평한 곳을 (흰색이어도) 검게 하고 윤곽만
  밝은 쪽 색으로 빛나게 한다. Feral [Insane] #582 게임 화면과 비교해서 맞췄다. Arcade는 주사선만 넣고 픽셀화하지
  않는다. Fisheye는 약하게(Feral Fisheye 48에서 옆 막대가 거의 곧다).
- 필터가 타일과 행성을 가리면 안 된다. 사용자가 Feral [Insane] 마지막 파트(MotionBlur 1000)에서 지적했다.
  모션 블러는 이전 프레임을 시간 기준으로 섞되 밝게만 남기고(지금 프레임은 그대로 선명), 비중은
  `motionTrail`이 최대 0.55로 제한한다.
- 손가락 배지는 별도 오버레이 캔버스에 그린다. 그래서 필터와 플래시가 손가락 색을 바꾸지 않고, 행성보다 위에
  온다. 이미 친 노트의 배지는 그리지 않는다.
- 장식(AddDecoration, AddText, `decorations` 배열, MoveDecorations, SetText)은 설정에서 켜야 보인다
  (기본 꺼짐). 사용자가 채보를 가린다고 해서다. 이미지 150px이 1타일이다. 장식은 depth와 상관없이 모두
  배경(배경 플래시 포함)과 타일 사이에 그리고, depth는 장식끼리의 순서만 정한다(작을수록 앞).
  Feral #582(depth 0 상자)와 #1487(depth −1 검은 막대) 게임 화면에서 타일과 행성이 장식 위에 있다.
  pivotOffset은 장식 자신의 좌표(회전·크기 적용)에서 이미지를 position으로부터 옮긴다. Feral #1485의
  1000% 막대 두 개(pivot −1.2, 회전 0°·180°)가 좌우로 12타일씩 벌어져 가운데 청록 패널을 감싼다.
  Nyan Cat 무지개(pivot −0.056, 24000%)와 Timeline 마법진(위성 8개)도 이 규칙에서 게임과 같다.
  parallax는 장식의 기준점(타일 기준이면 그 타일, Global이면 원점)에서 잰다: x + (카메라 − 기준점) × parallax.
  원점에서 재면 트랙을 따라 멀리 있는 장식이 화면 밖으로 밀린다(Feral #1196의 −20% 옆 막대). 나란히 놓은
  장식의 간격은 그대로다(Feral fakebg1 8장이 이미지 폭 간격).
- 배경 이미지: Unscaled + loopBG와 Tiled는 화면을 덮도록 반복한다. 크기는 장식과 같은 150px = 1타일 ×
  unscaledSize이고 카메라 줌을 따른다(Feral #1301 쉐브론 주기로 확인).
- 이미지(장식, 배경)는 레벨 zip이나 함께 드롭한 파일에서 읽는다(`render/levelImages.ts`).
- 올린 파일에 .adofai가 여러 개면(난이도별 레벨 등) 열기 전에 고르게 한다(`LevelPicker`, `chooseLevel`).
  에디터 자동 백업 `backup.adofai`는 후보에서 뺀다.
- 설정: `trackScreenFx`(화면 효과), `trackFilters`(필터·블룸), `trackDecorations`(장식, 기본 꺼짐).
- 행성과, 행성을 따라가는 카메라(Player)는 착지하는 순간의 타일 위치(MoveTrack 이동 포함)에 선다.
  `stickToFloors`는 착지한 뒤에도 타일을 따라갈지만 정한다. MoveCamera relativeTo Tile은 에디터에 놓인 원래
  타일 위치를 쓴다. Timeline #508은 타일을 70타일 치워 둔 채 원래 자리의 마법진을 비춘다.
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
