import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { seek, setLoop } from '../chart/controls';
import { useChart } from '../chart/model';
import { formatTime } from '../lib/format';
import { TimelineRenderer } from '../render/timelineRenderer';
import { usePlayer } from '../stores/player';

export function TimelineStrip() {
  const model = useChart();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const hoverRef = useRef(-1);
  const dragRef = useRef<number | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  useEffect(() => {
    const r = new TimelineRenderer(canvasRef.current!);
    rendererRef.current = r;
    const ro = new ResizeObserver(() => {
      const rect = wrapRef.current!.getBoundingClientRect();
      r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrapRef.current!);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = usePlayer.getState();
      r.draw(modelRef.current, engine.duration, engine.now(), p.loopA, p.loopB, hoverRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const tAt = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return { x, t: rendererRef.current!.timeAt(x, engine.duration) };
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-8 shrink-0 cursor-crosshair border-b border-border-soft"
      title="클릭: 이동 · Shift+드래그: 반복 구간 지정"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onMouseMove={(e) => {
          const h = tAt(e);
          hoverRef.current = h.x;
          setHover(h);
        }}
        onMouseLeave={() => {
          hoverRef.current = -1;
          setHover(null);
        }}
        onMouseDown={(e) => {
          const { t } = tAt(e);
          if (e.shiftKey) dragRef.current = t;
          else seek(t);
        }}
        onMouseUp={(e) => {
          if (dragRef.current == null) return;
          const { t } = tAt(e);
          if (Math.abs(t - dragRef.current) > 0.2) setLoop(dragRef.current, t);
          dragRef.current = null;
        }}
      />
      {hover && (
        <div
          className="pointer-events-none absolute top-1 rounded bg-canvas/90 px-1.5 py-0.5 text-[11px] text-ink-2 tabular"
          style={{ left: Math.min(hover.x + 8, (wrapRef.current?.clientWidth ?? 0) - 60) }}
        >
          {formatTime(hover.t, 1)}
        </div>
      )}
    </div>
  );
}
