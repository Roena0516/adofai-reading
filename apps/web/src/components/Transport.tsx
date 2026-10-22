import { upperBound } from '@adofai-reading/core';
import { ArrowDown, ArrowUp, Pause, Play, Repeat, SkipBack, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect } from 'react';
import { engine } from '../audio/engine';
import { clearLoop, seek, setLoopPoint, setRate, togglePlay } from '../chart/controls';
import { useChart } from '../chart/model';
import { formatTime } from '../lib/format';
import { usePlayer } from '../stores/player';
import { useSettings } from '../stores/settings';
import { Button, NumberField, Segmented, cx } from './ui';

const RATES = [0.25, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];

export function Transport() {
  const model = useChart();
  const { playing, time, loopA, loopB, loop, set: setPlayer } = usePlayer();
  const s = useSettings();
  const pitch = model.loaded.level.settings.pitch / 100;
  const { notes, noteTimes, tiles } = model.timing;
  const floor = notes[Math.max(0, upperBound(noteTimes, time) - 1)]?.floor ?? 0;

  useEffect(() => {
    setRate(s.rate * pitch);
  }, [s.rate, pitch]);

  const soundsOn = s.mode === 'view' ? s.noteSounds : s.guideSounds;
  const toggleSounds = () =>
    s.mode === 'view' ? s.set({ noteSounds: !s.noteSounds }) : s.set({ guideSounds: !s.guideSounds });

  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-t border-border-soft bg-canvas px-3 scroll-thin">
      <Button
        variant="primary"
        className="w-10 px-0"
        onClick={() => void togglePlay()}
        title="재생/일시정지 (Space)"
        aria-label={playing ? '일시정지' : '재생'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button
        variant="ghost"
        className="w-8 px-0"
        title="처음으로"
        aria-label="처음으로"
        onClick={() => seek(Math.max(-2, notes[0]!.time - s.leadIn))}
      >
        <SkipBack size={16} />
      </Button>
      <div className="w-32 text-sm text-ink-soft tabular">
        {formatTime(time)} <span className="text-dim">/ {formatTime(engine.duration, 0)}</span>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        타일
        <NumberField
          value={floor}
          min={1}
          max={tiles.length - 1}
          className="w-20"
          onChange={(v) => v != null && seek(tiles[Math.round(v)]!.time - s.leadIn)}
        />
      </label>

      <div className="h-6 w-px bg-border-soft" />

      <Segmented
        value={s.mode}
        onChange={(mode) => s.set({ mode })}
        options={[
          { value: 'view', label: '보기', title: '노트와 손가락 순서를 보면서 듣기' },
          { value: 'practice', label: '연습', title: '지정한 키로 직접 치고 판정 받기 (Tab)' },
        ]}
      />

      <label className="flex items-center gap-1.5 text-xs text-muted">
        속도
        <select
          value={s.rate}
          onChange={(e) => s.set({ rate: Number(e.target.value) })}
          className="field px-1.5"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              ×{r}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted" title="화면 스크롤 속도 (↑/↓)">
        스크롤
        <input
          type="range"
          min={300}
          max={6000}
          step={50}
          value={s.scrollSpeed}
          onChange={(e) => s.set({ scrollSpeed: Number(e.target.value) })}
          className="w-24"
        />
        <span className="w-10 text-right tabular">{s.scrollSpeed}</span>
      </label>

      <Button
        variant="ghost"
        className="w-8 px-0"
        title="낙하 방향"
        aria-label="낙하 방향 바꾸기"
        onClick={() => s.set({ direction: s.direction === 'down' ? 'up' : 'down' })}
      >
        {s.direction === 'down' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
      </Button>
      <Button
        variant="ghost"
        className="w-8 px-0"
        title={s.mode === 'view' ? '노트 히트사운드' : '가이드 히트사운드'}
        aria-label="히트사운드 켜기/끄기"
        onClick={toggleSounds}
      >
        {soundsOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </Button>

      <div className="h-6 w-px bg-border-soft" />

      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => setLoopPoint('A')} title="현재 위치를 A로 ([)">
          A{loopA != null && <span className="text-near tabular">{formatTime(loopA, 1)}</span>}
        </Button>
        <Button size="sm" onClick={() => setLoopPoint('B')} title="현재 위치를 B로 (])">
          B{loopB != null && <span className="text-wrong tabular">{formatTime(loopB, 1)}</span>}
        </Button>
        <Button
          size="sm"
          variant={loop ? 'primary' : 'default'}
          disabled={loopA == null || loopB == null}
          onClick={() => setPlayer({ loop: !loop })}
          title="A-B 반복 (\)"
          aria-label="A-B 반복"
        >
          <Repeat size={14} />
        </Button>
        {(loopA != null || loopB != null) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearLoop}
            title="반복 구간 지우기"
            aria-label="반복 구간 지우기"
          >
            <X size={14} />
          </Button>
        )}
      </div>
      <div className={cx('ml-auto hidden text-xs text-dim xl:block')}>
        Space 재생 · ←/→ 이동 · Tab 모드 · [ ] A/B
      </div>
    </footer>
  );
}
