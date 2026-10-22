import { switchLevel } from '../../chart/loader';
import { useChart } from '../../chart/model';
import { formatTime } from '../../lib/format';
import { useSettings } from '../../stores/settings';
import type { NoteLabel } from '../../stores/settings';
import { Button, Field, Kbd, NumberField, Section, Segmented, Slider, Toggle } from '../ui';

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsPanel() {
  const model = useChart();
  const s = useSettings();
  const { level, audioName, audioError, levelPaths, levelPath } = model.loaded;
  const st = level.settings;
  const warnings = [
    ...level.warnings,
    ...model.timing.warnings,
    ...model.fingering.errors,
    ...(audioError ? [audioError] : []),
  ];
  const chords = model.analysis.events.filter((e) => e.noteCount > 1).length;

  return (
    <div className="space-y-6 p-4">
      <Section title="레벨">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-dim">곡</dt>
          <dd className="truncate">{st.song || '–'}</dd>
          <dt className="text-dim">작곡</dt>
          <dd className="truncate">{st.artist || '–'}</dd>
          <dt className="text-dim">채보</dt>
          <dd className="truncate">{st.author || '–'}</dd>
          <dt className="text-dim">BPM · 오프셋</dt>
          <dd className="tabular">
            {st.bpm} · {st.offset}ms · 피치 {st.pitch}%
          </dd>
          <dt className="text-dim">노트</dt>
          <dd className="tabular">
            {model.timing.notes.length}개 · 따닥 {chords}개 · 연타 {model.analysis.runs.length}개
          </dd>
          <dt className="text-dim">길이</dt>
          <dd className="tabular">{formatTime(model.timing.endTime, 1)}</dd>
          <dt className="text-dim">음악</dt>
          <dd className="truncate">{audioName ?? '없음'}</dd>
        </dl>
        {levelPaths.length > 1 && (
          <select
            value={levelPath}
            onChange={(e) => void switchLevel(e.target.value)}
            className="field w-full"
          >
            {levelPaths.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-warn/30 bg-warn/5 p-2 text-xs leading-relaxed text-far">
            {warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="화면">
        <Field label="노트 표시">
          <Segmented<NoteLabel>
            size="sm"
            value={s.noteLabel}
            onChange={(noteLabel) => s.set({ noteLabel })}
            options={[
              { value: 'lane', label: '번호' },
              { value: 'finger', label: '손가락' },
              { value: 'none', label: '없음' },
            ]}
          />
        </Field>
        <Field label="레인 너비">
          <Slider
            value={s.laneWidth}
            min={36}
            max={120}
            step={2}
            onChange={(laneWidth) => s.set({ laneWidth })}
          />
        </Field>
        <Field label="노트 두께">
          <Slider
            value={s.noteHeight}
            min={4}
            max={28}
            step={1}
            onChange={(noteHeight) => s.set({ noteHeight })}
          />
        </Field>
        <Toggle
          label="연타 정보 표시 (오른쪽)"
          checked={s.showRunLabels}
          onChange={(showRunLabels) => s.set({ showRunLabels })}
        />
        <Toggle
          label="박자선 표시"
          checked={s.showBeatLines}
          onChange={(showBeatLines) => s.set({ showBeatLines })}
        />
        <Field
          label="동타 노트 위치"
          hint="따닥처럼 몇 ms 차이로 찍힌 노트를 실제 시각대로 그릴지, 첫 노트 시각에 나란히 그릴지 고릅니다. 연습 판정도 같은 시각을 씁니다."
        >
          <Segmented
            size="sm"
            value={s.chordDisplay}
            onChange={(chordDisplay) => s.set({ chordDisplay })}
            options={[
              { value: 'actual', label: '실제 시각' },
              { value: 'together', label: '동시에' },
            ]}
          />
        </Field>
      </Section>

      <Section title="얼불춤 화면">
        <Toggle
          label="레인 오른쪽에 표시"
          checked={s.showTrack}
          onChange={(showTrack) => s.set({ showTrack })}
        />
        {s.showTrack && (
          <>
            <Toggle
              label="레벨 효과 적용 (카메라·타일 이동·등장)"
              checked={s.trackEffects}
              onChange={(trackEffects) => s.set({ trackEffects })}
            />
            <Toggle
              label="화면 효과 (배경·플래시·흔들림·행성 회전)"
              checked={s.trackScreenFx}
              onChange={(trackScreenFx) => s.set({ trackScreenFx })}
            />
            <Toggle
              label="필터·블룸 (글리치·VHS·어안·눈 등)"
              checked={s.trackFilters}
              onChange={(trackFilters) => s.set({ trackFilters })}
            />
            <Toggle
              label="장식 (이미지·글자) — 타일을 가릴 수 있어요"
              checked={s.trackDecorations}
              onChange={(trackDecorations) => s.set({ trackDecorations })}
            />
            <Field label="카메라 따라가기" hint="값이 작을수록 카메라가 행성을 천천히 따라갑니다.">
              <Slider
                value={s.cameraFollow}
                min={1}
                max={20}
                step={0.5}
                onChange={(cameraFollow) => s.set({ cameraFollow })}
              />
            </Field>
            <Field label="확대">
              <Slider
                value={s.trackScale}
                min={30}
                max={300}
                step={10}
                format={(v) => `${v}%`}
                onChange={(trackScale) => s.set({ trackScale })}
              />
            </Field>
            <Field label="타일 색">
              <Segmented
                size="sm"
                value={s.trackColorMode}
                onChange={(trackColorMode) => s.set({ trackColorMode })}
                options={[
                  { value: 'level', label: '레벨 색' },
                  { value: 'finger', label: '손가락 색' },
                ]}
              />
            </Field>
            <Toggle
              label="타일에 레인 번호 표시"
              checked={s.trackLabels}
              onChange={(trackLabels) => s.set({ trackLabels })}
            />
          </>
        )}
      </Section>

      <Section title="소리">
        <Field label="음악">
          <Slider
            value={s.musicVolume}
            min={0}
            max={1}
            step={0.05}
            format={pctFmt}
            onChange={(musicVolume) => s.set({ musicVolume })}
          />
        </Field>
        <Field
          label="히트사운드"
          hint="왼손은 왼쪽, 오른손은 오른쪽에서 들리고 손가락마다 음높이가 다릅니다."
        >
          <Slider
            value={s.hitVolume}
            min={0}
            max={1}
            step={0.05}
            format={pctFmt}
            onChange={(hitVolume) => s.set({ hitVolume })}
          />
        </Field>
        <Toggle
          label="보기 모드: 노트마다 히트사운드"
          checked={s.noteSounds}
          onChange={(noteSounds) => s.set({ noteSounds })}
        />
        <Toggle
          label="연습 모드: 키 누를 때 소리"
          checked={s.pressSounds}
          onChange={(pressSounds) => s.set({ pressSounds })}
        />
        <Toggle
          label="연습 모드: 정답 가이드 소리"
          checked={s.guideSounds}
          onChange={(guideSounds) => s.set({ guideSounds })}
        />
        <Toggle
          label="메트로놈 (기준 BPM)"
          checked={s.metronome}
          onChange={(metronome) => s.set({ metronome })}
        />
        {s.metronome && (
          <Field label="메트로놈 음량">
            <Slider
              value={s.metroVolume}
              min={0}
              max={1}
              step={0.05}
              format={pctFmt}
              onChange={(metroVolume) => s.set({ metroVolume })}
            />
          </Field>
        )}
      </Section>

      <Section title="싱크">
        <Field label="화면 오프셋 (ms)" hint="노트가 소리보다 먼저 지나가 보이면 +로 올리세요.">
          <NumberField
            value={s.visualOffsetMs}
            min={-300}
            max={300}
            className="w-20"
            onChange={(v) => v != null && s.set({ visualOffsetMs: v })}
          />
        </Field>
        <Field
          label="입력 오프셋 (ms)"
          hint="판정이 계속 늦게 나오면 +로 올리세요. 키보드·블루투스 지연을 보정합니다."
        >
          <NumberField
            value={s.inputOffsetMs}
            min={-300}
            max={300}
            className="w-20"
            onChange={(v) => v != null && s.set({ inputOffsetMs: v })}
          />
        </Field>
        <Field label="이동할 때 미리 시작 (초)">
          <NumberField
            value={s.leadIn}
            min={0}
            max={10}
            step={0.5}
            className="w-20"
            onChange={(v) => v != null && s.set({ leadIn: v })}
          />
        </Field>
      </Section>

      <Section title="단축키">
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            <Kbd>Space</Kbd> 재생 / 일시정지
          </li>
          <li>
            <Kbd>←</Kbd> <Kbd>→</Kbd> 2초 이동 (Shift: 10초)
          </li>
          <li>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> 스크롤 속도
          </li>
          <li>
            <Kbd>Tab</Kbd> 보기 / 연습 전환
          </li>
          <li>
            <Kbd>[</Kbd> <Kbd>]</Kbd> A / B 지점, <Kbd>\</Kbd> 반복 켜기
          </li>
          <li className="text-xs text-dim">연습 모드에서는 레인에 묶인 키가 단축키보다 우선합니다.</li>
        </ul>
      </Section>

      <Button size="sm" variant="ghost" onClick={s.reset}>
        화면·소리 설정 초기화
      </Button>
    </div>
  );
}
