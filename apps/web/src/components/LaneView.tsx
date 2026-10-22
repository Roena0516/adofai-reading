import type { Finger, Judge, KeyBase } from '@adofai-reading/core';
import {
  BASE_LABEL,
  JUDGE,
  Judge as JudgeImpl,
  adofaiWindows,
  computeStats,
  describeOrder,
  divisionLabel,
  formatOrder,
  runScores,
  upperBound,
} from '@adofai-reading/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { nudge, onPlaybackReset, seek, setLoopPoint, togglePlay } from '../chart/controls';
import type { ChartModel } from '../chart/model';
import { useChart } from '../chart/model';
import { pct } from '../lib/format';
import type { LastHit } from '../render/laneRenderer';
import { LaneRenderer } from '../render/laneRenderer';
import { useOverrides } from '../stores/overrides';
import { usePlayer } from '../stores/player';
import { usePractice } from '../stores/practice';
import type { Settings } from '../stores/settings';
import { useSettings } from '../stores/settings';
import { cx } from './ui';

export const FINGER_PITCH: Record<Finger, number> = {
  thumb: 1.12,
  index: 1,
  middle: 0.89,
  ring: 0.79,
  pinky: 0.7,
};

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

const isTyping = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
};

/** The falling-note lanes; as an overlay they sit on the left of the game view with a translucent panel. */
export function LaneView({ overlay, width }: { overlay: boolean; width: number }) {
  const model = useChart();
  const settings = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LaneRenderer | null>(null);
  const judgeRef = useRef<Judge | null>(null);
  const live = useRef({
    pressed: new Uint8Array(32),
    pressAt: new Float64Array(32).fill(-1e9),
    lastHit: null as LastHit | null,
    hoverNote: -1,
    drag: null as null | { note: number; lane: number; from: number; x: number; y: number; moved: boolean },
  });
  const modelRef = useLatest(model);
  const settingsRef = useLatest(settings);
  const overlayRef = useLatest(overlay);
  const patchOverrides = useOverrides((s) => s.patch);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV)
      Object.assign((window as unknown as { __adofai: object }).__adofai ?? {}, { model, judge: judgeRef });
  }, [model]);

  // Practice judge: rebuilt when fingering or windows change, reset on every jump.
  const { mode, judgeStrictness } = settings;
  const { timing, fingering, noteAuto, displayTimes } = model;
  // the game's windows: by angle at each note's BPM, never narrower than the timing option allows
  const windows = useMemo(
    () =>
      adofaiWindows(
        Float64Array.from(timing.notes, (n) => n.bpm),
        judgeStrictness,
      ),
    [timing, judgeStrictness],
  );
  useEffect(() => {
    if (mode !== 'practice') {
      judgeRef.current = null;
      usePractice.getState().set({ judge: null, stats: null, runScores: [] });
      return;
    }
    const j = new JudgeImpl(displayTimes, fingering.noteLane, noteAuto, windows);
    j.reset(engine.now());
    judgeRef.current = j;
    usePractice.getState().set({ judge: j });
    const off = onPlaybackReset((t) => j.reset(t));
    const offEpoch = usePractice.subscribe((s, prev) => {
      if (s.epoch !== prev.epoch) j.reset(engine.now());
    });
    return () => {
      off();
      offEpoch();
      if (usePractice.getState().judge === j) usePractice.getState().set({ judge: null });
    };
  }, [mode, fingering, noteAuto, windows, displayTimes]);

  // Hitsounds follow the fingering: panned by hand, pitched by finger.
  useEffect(() => {
    const n = timing.notes.length;
    const pan = new Float32Array(n);
    const pitch = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lane = model.lanes[fingering.noteLane[i]!];
      pan[i] = lane ? (lane.hand === 'L' ? -0.55 : 0.55) : 0;
      pitch[i] = lane ? FINGER_PITCH[lane.finger] : 1;
    }
    engine.setHits(timing.noteTimes, pan, pitch);
  }, [timing, fingering, model.lanes]);

  const sections = model.analysis.sections;
  useEffect(() => {
    const times: number[] = [];
    const bars: number[] = [];
    sections.forEach((sec, i) => {
      const end = sections[i + 1]?.startTime ?? engine.duration;
      const spb = 60 / sec.bpm;
      for (let k = 0; sec.startTime + k * spb < end && times.length < 200000; k++) {
        times.push(sec.startTime + k * spb);
        bars.push(k % 4 === 0 ? 1 : 0);
      }
    });
    engine.setMetronome(Float64Array.from(times), Uint8Array.from(bars));
  }, [sections]);

  useEffect(() => {
    engine.hitsEnabled = settings.mode === 'view' ? settings.noteSounds : settings.guideSounds;
    engine.metroEnabled = settings.metronome;
    engine.setVolumes({ music: settings.musicVolume, hits: settings.hitVolume, metro: settings.metroVolume });
  }, [
    settings.mode,
    settings.noteSounds,
    settings.guideSounds,
    settings.metronome,
    settings.musicVolume,
    settings.hitVolume,
    settings.metroVolume,
  ]);

  // Canvas size
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new LaneRenderer(canvas);
    rendererRef.current = r;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    let lastStats = 0;
    const tick = (perf: number) => {
      raf = requestAnimationFrame(tick);
      const r = rendererRef.current;
      if (!r) return;
      const m = modelRef.current;
      const s = settingsRef.current;
      const p = usePlayer.getState();
      let t = engine.now(perf);
      if (engine.playing && p.loop && p.loopA != null && p.loopB != null && t >= Math.max(p.loopA, p.loopB)) {
        seek(Math.min(p.loopA, p.loopB));
        t = engine.now();
      }
      const judge = judgeRef.current;
      if (judge && engine.playing) {
        const misses = judge.update(t - s.inputOffsetMs / 1000);
        const last = misses[misses.length - 1];
        if (last) live.current.lastHit = { code: JUDGE.miss, offsetMs: 0, at: perf, lane: last.expectedLane };
      }
      r.draw({
        time: t - s.visualOffsetMs / 1000,
        perfNow: perf,
        model: m,
        settings: s,
        judge,
        pressed: live.current.pressed,
        pressAt: live.current.pressAt,
        lastHit: live.current.lastHit,
        hoverNote: live.current.hoverNote,
        loopA: p.loopA,
        loopB: p.loopB,
        playing: engine.playing,
        overlay: overlayRef.current,
        drag: live.current.drag && { note: live.current.drag.note, lane: live.current.drag.lane },
      });
      if (perf - lastUi > 100) {
        lastUi = perf;
        if (p.playing !== engine.playing) p.set({ playing: engine.playing });
        p.set({ time: t });
      }
      if (judge && perf - lastStats > 300) {
        lastStats = perf;
        const wrongIsMiss = m.profile.judge.wrongFingerIsMiss;
        usePractice.getState().set({
          stats: computeStats(judge, m.fingering.noteLane, m.lanes.length, wrongIsMiss),
          runScores: runScores(judge, m.analysis, wrongIsMiss),
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelRef, settingsRef, overlayRef]);

  // Keyboard: lane keys in practice, shortcuts otherwise.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      const m = modelRef.current;
      const s = settingsRef.current;
      const lane = s.mode === 'practice' ? m.profile.keys.indexOf(e.code) : -1;
      if (lane >= 0 && lane < m.lanes.length) {
        e.preventDefault();
        if (e.repeat) return;
        const st = live.current;
        st.pressed[lane] = 1;
        st.pressAt[lane] = performance.now();
        const ln = m.lanes[lane]!;
        if (s.pressSounds) engine.click(ln.hand === 'L' ? -0.55 : 0.55, FINGER_PITCH[ln.finger]);
        const j = judgeRef.current;
        if (j && engine.playing) {
          const hit = j.press(lane, engine.now(e.timeStamp) - s.inputOffsetMs / 1000);
          if (hit) st.lastHit = { code: hit.code, offsetMs: hit.offsetMs, at: performance.now(), lane };
        }
        return;
      }
      handleShortcut(e, s);
    };
    const up = (e: KeyboardEvent) => {
      const lane = modelRef.current.profile.keys.indexOf(e.code);
      if (lane >= 0) live.current.pressed[lane] = 0;
    };
    const blur = () => live.current.pressed.fill(0);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [modelRef, settingsRef]);

  // Mouse: click a note while paused to change its finger, wheel to scrub.
  const frameFor = () => ({
    time: engine.now() - settingsRef.current.visualOffsetMs / 1000,
    perfNow: performance.now(),
    model: modelRef.current,
    settings: settingsRef.current,
    judge: judgeRef.current,
    pressed: live.current.pressed,
    pressAt: live.current.pressAt,
    lastHit: null,
    hoverNote: -1,
    loopA: null,
    loopB: null,
    playing: engine.playing,
    overlay: overlayRef.current,
    drag: null,
  });
  const localXY = (e: React.MouseEvent | React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };
  const onMove = (e: React.MouseEvent) => {
    if (engine.playing) {
      live.current.hoverNote = -1;
      setHovering(false);
      return;
    }
    const i = noteAt(e);
    live.current.hoverNote = i;
    setHovering(i >= 0);
  };
  const setNoteLane = (note: number, lane: number | null) => {
    const m = modelRef.current;
    const floor = String(m.timing.notes[note]!.floor);
    patchOverrides(m.loaded.hash, (o) => {
      const notes = { ...o.notes };
      if (lane == null) delete notes[floor];
      else notes[floor] = lane;
      return { ...o, notes };
    });
  };
  const noteAt = (e: React.MouseEvent) => {
    const [x, y] = localXY(e);
    return rendererRef.current?.hitTest(frameFor(), x, y) ?? -1;
  };
  // Press on a note while paused: drag it to another lane, or release in place to cycle its finger.
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || engine.playing) return;
    const i = noteAt(e);
    if (i < 0) return;
    e.preventDefault();
    const lane = modelRef.current.fingering.noteLane[i]!;
    live.current.drag = { note: i, lane, from: lane, x: e.clientX, y: e.clientY, moved: false };
    const move = (ev: MouseEvent) => {
      const d = live.current.drag;
      if (!d) return;
      if (Math.abs(ev.clientX - d.x) > 4 || Math.abs(ev.clientY - d.y) > 4) d.moved = true;
      const rect = canvasRef.current!.getBoundingClientRect();
      d.lane = rendererRef.current!.laneAt(frameFor(), ev.clientX - rect.left);
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = live.current.drag;
      live.current.drag = null;
      if (!d) return;
      if (d.moved) {
        if (d.lane !== d.from) setNoteLane(d.note, d.lane);
        return;
      }
      const L = modelRef.current.lanes.length;
      setNoteLane(d.note, (d.from + (ev.shiftKey ? -1 : 1) + L) % L);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const onContext = (e: React.MouseEvent) => {
    const i = noteAt(e);
    if (i < 0) return;
    e.preventDefault();
    setNoteLane(i, null);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (engine.playing) return;
    const s = settingsRef.current;
    const dir = s.direction === 'down' ? -1 : 1;
    seek(engine.now() + (dir * e.deltaY) / s.scrollSpeed);
  };

  return (
    <div
      ref={wrapRef}
      className={cx(
        'overflow-hidden',
        overlay
          ? 'absolute top-0 bottom-0 left-0 z-10 border-r border-border-soft/70 backdrop-blur-[3px]'
          : 'relative min-w-0 flex-1',
      )}
      style={overlay ? { width } : undefined}
    >
      <canvas
        ref={canvasRef}
        className={cx('absolute inset-0', hovering && 'cursor-pointer')}
        onMouseMove={onMove}
        onMouseLeave={() => {
          live.current.hoverNote = -1;
          setHovering(false);
        }}
        onMouseDown={onMouseDown}
        onContextMenu={onContext}
        onWheel={onWheel}
      />
    </div>
  );
}

function handleShortcut(e: KeyboardEvent, s: Settings) {
  const set = useSettings.getState().set;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      void togglePlay();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      nudge(e.shiftKey ? -10 : -2);
      break;
    case 'ArrowRight':
      e.preventDefault();
      nudge(e.shiftKey ? 10 : 2);
      break;
    case 'ArrowUp':
      e.preventDefault();
      set({ scrollSpeed: Math.min(8000, s.scrollSpeed + 100) });
      break;
    case 'ArrowDown':
      e.preventDefault();
      set({ scrollSpeed: Math.max(200, s.scrollSpeed - 100) });
      break;
    case 'BracketLeft':
      setLoopPoint('A');
      break;
    case 'BracketRight':
      setLoopPoint('B');
      break;
    case 'Backslash': {
      const p = usePlayer.getState();
      p.set({ loop: !p.loop });
      break;
    }
    case 'Tab':
      e.preventDefault();
      set({ mode: s.mode === 'view' ? 'practice' : 'view' });
      break;
  }
}

export function Hud({ model, settings }: { model: ChartModel; settings: Settings }) {
  const time = usePlayer((s) => s.time);
  const info = useMemo(() => {
    const { timing, analysis, fingering, lanes } = model;
    const next = Math.min(timing.notes.length - 1, upperBound(timing.noteTimes, time - 0.02));
    const note = timing.notes[next]!;
    const ev = analysis.events[analysis.noteEvent[next]!]!;
    let runIdx = ev.run;
    // Prefer the next real stream (3+ events) within a few seconds.
    for (let r = ev.run; r < analysis.runs.length && analysis.runs[r]!.startTime < time + 4; r++) {
      if (analysis.runs[r]!.eventCount >= 3) {
        runIdx = r;
        break;
      }
    }
    const run = analysis.runs[runIdx]!;
    const tile = timing.tiles[note.floor - 1] ?? timing.tiles[0]!;
    const sec = analysis.sections[ev.section]!;
    const seq = fingering.runSeq[runIdx] ?? [];
    return {
      floor: note.floor,
      tileBpm: tile.bpm,
      baseBpm: sec.bpm,
      run,
      seq,
      order: describeOrder(seq, lanes),
      runIdx,
    };
  }, [model, time]);
  const bandIdx = model.fingering.runBand[info.runIdx] ?? -1;
  const runBase = model.fingering.runBase[info.runIdx] ?? 0;
  return (
    <div className="space-y-1 rounded-xl border border-border-soft bg-canvas/85 px-2.5 py-2 text-[11px] backdrop-blur">
      <div className="flex justify-between gap-2 text-muted tabular">
        <span>
          <b className="text-ink">#{info.floor}</b> · 타일 {+info.tileBpm.toFixed(1)}
        </span>
        <span>
          기준 <b className="text-warn">{+info.baseBpm.toFixed(2)}</b>
        </span>
      </div>
      <div className="border-t border-border-soft pt-1">
        <div className="text-muted">
          {info.run.startTime > time + 0.05 ? '다음 연타' : '현재 연타'} · {info.run.eventCount}타
          {bandIdx >= 0 &&
            (model.profile.mode === 'simple' ? (
              <>
                {' '}
                · {info.seq.length}키
                {runBase > 0 && <span className="text-dim"> ({BASE_LABEL[runBase as KeyBase]})</span>}
              </>
            ) : (
              <> · 구간 {bandIdx + 1}</>
            ))}
        </div>
        <div className="text-[13px] font-medium text-ink tabular">
          {Math.round(info.run.effBpm)} BPM · {divisionLabel(info.run.division, info.run.divisionRaw)}
        </div>
        <div className="truncate text-ink-soft">
          <span className="font-mono text-ink">{formatOrder(info.seq)}</span> · {info.order}
        </div>
      </div>
      {settings.mode === 'practice' && (
        <div className="text-accent-soft">연습 모드 · 지정한 키로 쳐 보세요</div>
      )}
    </div>
  );
}

export function PracticeHud() {
  const stats = usePractice((s) => s.stats);
  if (!stats || !stats.judged) return null;
  return (
    <div className="rounded-xl border border-border-soft bg-canvas/85 px-2.5 py-2 text-[11px] backdrop-blur tabular">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-medium text-ink">{pct(stats.accuracy)}</span>
        <span className="text-muted">
          콤보 {stats.combo} · 최대 {stats.maxCombo}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-5 gap-1 text-center">
        {(
          [
            ['완벽', stats.perfect, 'text-perfect'],
            ['빠름·느림', stats.near, 'text-near'],
            ['빠름·느림', stats.far, 'text-far'],
            ['틀림', stats.wrong, 'text-wrong'],
            ['미스', stats.miss, 'text-miss'],
          ] as const
        ).map(([label, n, color]) => (
          <div key={color}>
            <div className={`text-[13px] font-medium ${color}`}>{n}</div>
            <div className="text-[10px] tracking-tight whitespace-nowrap text-dim">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
