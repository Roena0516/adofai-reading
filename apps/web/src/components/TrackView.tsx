import { CameraTimeline } from '@adofai-reading/core';
import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { seek } from '../chart/controls';
import { engine } from '../audio/engine';
import { useChart } from '../chart/model';
import { LevelImages } from '../render/levelImages';
import { PostFx, postFxActive } from '../render/postfx';
import { TrackRenderer } from '../render/trackRenderer';
import { useSettings } from '../stores/settings';
import { Button, Segmented } from './ui';

/** The chart as it looks in the game: tiles, planets, track effects and the level's camera. */
export function TrackView({ leftInset = 0 }: { leftInset?: number }) {
  const model = useChart();
  const scale = useSettings((s) => s.trackScale);
  const colorMode = useSettings((s) => s.trackColorMode);
  const effects = useSettings((s) => s.trackEffects);
  const decorations = useSettings((s) => s.trackDecorations);
  const follow = useSettings((s) => s.cameraFollow);
  const set = useSettings((s) => s.set);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const images = useMemo(
    () => new LevelImages(model.loaded.archive, model.loaded.levelPath),
    [model.loaded.archive, model.loaded.levelPath],
  );
  useEffect(() => () => images.dispose(), [images]);
  useEffect(() => {
    images.preload(model.vfx.images);
    if (decorations) images.preload(model.decorations.images);
  }, [images, model.vfx, model.decorations, decorations]);

  const camera = useMemo(
    () =>
      new CameraTimeline(model.loaded.level, model.timing, model.track, effects ? model.effects : null, {
        follow,
        events: effects,
      }),
    [model.loaded.level, model.timing, model.track, model.effects, effects, follow],
  );
  const live = useRef({ model, camera, leftInset, images, width: 0 });
  live.current = { ...live.current, model, camera, leftInset, images };

  useEffect(() => {
    const r = new TrackRenderer(canvasRef.current!, overlayRef.current);
    const gl = glRef.current!;
    const post = new PostFx(gl);
    const ro = new ResizeObserver(() => {
      const rect = wrapRef.current!.getBoundingClientRect();
      live.current.width = rect.width;
      r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrapRef.current!);
    let raf = 0;
    let lastFrame = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useSettings.getState();
      const { model: m, camera: cam, images: img } = live.current;
      const t = engine.now() - s.visualOffsetMs / 1000;
      const state = (s.trackScreenFx || s.trackFilters) && m.vfx.any ? m.vfx.at(t) : null;
      r.draw(m, cam, t, {
        scale: s.trackScale,
        labels: s.trackLabels,
        colorMode: s.trackColorMode,
        effects: s.trackEffects,
        centerX: live.current.leftInset + (live.current.width - live.current.leftInset) / 2,
        vfx: s.trackScreenFx ? state : null,
        planetEase: s.trackScreenFx,
        decorations: s.trackDecorations,
        images: img,
      });
      const filtered = !!state && s.trackFilters && post.supported && postFxActive(state);
      const now = performance.now();
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      if (filtered)
        post.render(r.frame, {
          filters: state.filters,
          bloom: state.bloom,
          time: t,
          dt,
          pixelRatio: window.devicePixelRatio || 1,
        });
      gl.style.visibility = filtered ? 'visible' : 'hidden';
    };
    raf = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const zoomBy = (d: number) => set({ trackScale: Math.max(30, Math.min(300, scale + d)) });

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY > 0 ? -10 : 10);
        else if (!engine.playing) seek(engine.now() + e.deltaY / 1500);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <canvas ref={glRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1.5 rounded-xl bg-canvas/85 px-2.5 py-2 text-xs text-ink-soft shadow-[0_0_0_1px_var(--color-border-soft)] backdrop-blur">
        <div className="flex items-center gap-1">
          <span className="mr-1 font-medium text-ink">얼불춤 화면</span>
          <Button size="sm" variant="ghost" aria-label="축소" onClick={() => zoomBy(-10)}>
            <Minus size={12} />
          </Button>
          <span className="w-9 text-center tabular">{scale}%</span>
          <Button size="sm" variant="ghost" aria-label="확대" onClick={() => zoomBy(10)}>
            <Plus size={12} />
          </Button>
          <Segmented
            size="sm"
            value={colorMode}
            onChange={(trackColorMode) => set({ trackColorMode })}
            options={[
              { value: 'level', label: '레벨 색', title: '레벨에 설정된 타일 색 · 손가락은 배지로 표시' },
              { value: 'finger', label: '손가락 색', title: '타일을 칠 손가락 색으로 칠하기' },
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label="얼불춤 화면 닫기"
            onClick={() => set({ showTrack: false })}
          >
            <X size={12} />
          </Button>
        </div>
        <div className="text-[11px] text-dim">
          배지 = 칠 레인 · <span className="text-[#8f7bff]">나선</span> 소용돌이 ·{' '}
          <span className="text-[#ff5a5a]">»</span> 빨라짐 · <span className="text-[#4f8bff]">«</span> 느려짐
          {!effects && ' · 레벨 효과 꺼짐'}
        </div>
      </div>
    </div>
  );
}
