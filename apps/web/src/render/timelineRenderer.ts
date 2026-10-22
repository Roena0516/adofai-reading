import type { ChartModel } from '../chart/model';
import { bandColor } from './colors';

const MIN_BPM = 60;
const MAX_BPM = 4000;

export class TimelineRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private baseKey = '';
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.baseKey = '';
  }

  timeAt(x: number, duration: number): number {
    return (x / Math.max(1, this.w)) * duration;
  }

  private prerender(model: ChartModel, duration: number): void {
    const b = this.base;
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const c = b.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#211f24';
    c.fillRect(0, 0, this.w, this.h);
    const toX = (t: number) => (t / duration) * this.w;
    const usable = this.h - 12;
    const scale = (bpm: number) =>
      Math.max(0.06, Math.min(1, Math.log(Math.max(bpm, MIN_BPM) / MIN_BPM) / Math.log(MAX_BPM / MIN_BPM)));
    const { runs } = model.analysis;
    runs.forEach((run, r) => {
      if (!(run.effBpm > 0)) return;
      const x1 = toX(run.startTime);
      const x2 = Math.max(x1 + 1, toX(run.endTime));
      const hh = scale(run.effBpm) * usable;
      c.fillStyle = bandColor(model.fingering.runBand[r]!);
      c.globalAlpha = run.eventCount >= 3 ? 0.9 : 0.45;
      c.fillRect(x1, this.h - hh, x2 - x1, hh);
    });
    c.globalAlpha = 1;
    c.fillStyle = '#f2c97a';
    for (const sec of model.analysis.sections) c.fillRect(Math.round(toX(sec.startTime)), 0, 1, 8);
  }

  draw(
    model: ChartModel,
    duration: number,
    time: number,
    loopA: number | null,
    loopB: number | null,
    hoverX: number,
  ): void {
    const key = `${this.w}x${this.h}:${duration}`;
    if (this.baseKey !== key || (this as { lastModel?: ChartModel }).lastModel !== model) {
      this.prerender(model, duration);
      this.baseKey = key;
      (this as { lastModel?: ChartModel }).lastModel = model;
    }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.base, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const toX = (t: number) => (t / duration) * this.w;
    if (loopA != null && loopB != null) {
      c.fillStyle = 'rgba(155,227,182,0.12)';
      c.fillRect(toX(Math.min(loopA, loopB)), 0, Math.abs(toX(loopB) - toX(loopA)), this.h);
    }
    for (const [t, color] of [
      [loopA, '#9be3b6'],
      [loopB, '#ff7a7a'],
    ] as const) {
      if (t == null) continue;
      c.fillStyle = color;
      c.fillRect(Math.round(toX(t)), 0, 2, this.h);
    }
    if (hoverX >= 0) {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(Math.round(hoverX), 0, 1, this.h);
    }
    c.fillStyle = '#f2edef';
    c.fillRect(Math.round(toX(time)) - 1, 0, 2, this.h);
  }
}
