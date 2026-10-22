import type { Judge } from '@adofai-reading/core';
import {
  FINGER_SHORT,
  JUDGE,
  JUDGE_LABEL,
  divisionLabel,
  formatOrder,
  keyLabel,
  laneLabel,
  lowerBound,
  upperBound,
} from '@adofai-reading/core';
import type { ChartModel } from '../chart/model';
import { formatMs } from '../lib/format';
import type { Settings } from '../stores/settings';
import { divisionColor, JUDGE_COLOR, laneColor, runColor } from './colors';

export type LaneSettings = Pick<
  Settings,
  | 'scrollSpeed'
  | 'direction'
  | 'laneWidth'
  | 'noteHeight'
  | 'noteLabel'
  | 'showRunLabels'
  | 'showBeatLines'
  | 'mode'
>;

export interface LastHit {
  code: number;
  offsetMs: number;
  at: number;
  lane: number;
}

export interface LaneFrame {
  time: number;
  perfNow: number;
  model: ChartModel;
  settings: LaneSettings;
  judge: Judge | null;
  pressed: Uint8Array;
  pressAt: Float64Array;
  lastHit: LastHit | null;
  hoverNote: number;
  loopA: number | null;
  loopB: number | null;
  playing: boolean;
  /** Lanes drawn as a translucent panel over the game view (no HUD space reserved). */
  overlay: boolean;
  /** A note being dragged to another lane. */
  drag: { note: number; lane: number } | null;
}

interface Geometry {
  laneW: number;
  laneX: number[];
  left: number;
  right: number;
  judgeY: number;
  keyTop: number;
  keyH: number;
  /** Whether the run labels fit to the right of the lanes. */
  labels: boolean;
}

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
/** Width of the HUD card drawn over the top-left of the canvas (see LaneView). */
export const HUD_WIDTH = 232;
const OVERLAY_PAD = 20;
const HAND_GAP = 14;
const LABEL_W = 210;
/** Narrower run-label column when the lanes float over the game view. */
const LABEL_W_OVERLAY = 150;

/** Width of the translucent lane panel laid over the game view. */
export function laneOverlayWidth(
  lanes: ChartModel['lanes'],
  s: Pick<Settings, 'laneWidth' | 'showRunLabels'>,
): number {
  const both = lanes.some((l) => l.hand === 'L') && lanes.some((l) => l.hand === 'R');
  return (
    OVERLAY_PAD +
    lanes.length * s.laneWidth +
    (both ? HAND_GAP : 0) +
    (s.showRunLabels ? LABEL_W_OVERLAY : OVERLAY_PAD)
  );
}

export class LaneRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private runEndCache: { model: ChartModel | null; ends: Float64Array } = {
    model: null,
    ends: new Float64Array(0),
  };

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
  }

  geometry(frame: Pick<LaneFrame, 'model' | 'settings' | 'overlay'>): Geometry {
    const { lanes } = frame.model;
    const s = frame.settings;
    const laneW = s.laneWidth;
    const hasL = lanes.some((l) => l.hand === 'L');
    const hasR = lanes.some((l) => l.hand === 'R');
    const gap = hasL && hasR ? HAND_GAP : 0;
    const total = lanes.length * laneW + gap;
    const labelW = LABEL_W;
    // Keep clear of the HUD card in the top-left; drop the run labels before overlapping it.
    const hudClear = HUD_WIDTH + 20;
    const centered = (lw: number) => Math.round((this.w - total - lw) / 2);
    let labels = s.showRunLabels;
    let left: number;
    if (frame.overlay) left = OVERLAY_PAD;
    else if (labels && centered(labelW) >= hudClear) left = centered(labelW);
    else if (labels && hudClear + total + labelW <= this.w) left = hudClear;
    else {
      labels = false;
      left =
        centered(0) >= hudClear
          ? centered(0)
          : hudClear + total <= this.w
            ? hudClear
            : Math.max(16, centered(0));
    }
    const laneX = lanes.map((l, i) => left + i * laneW + (l.hand === 'R' && hasL ? gap : 0));
    const down = s.direction === 'down';
    const judgeY = down ? this.h - 104 : 104;
    const keyH = 58;
    const keyTop = down ? judgeY + 14 : judgeY - 14 - keyH;
    return { laneW, laneX, left, right: left + total, judgeY, keyTop, keyH, labels };
  }

  /** Song time at a canvas y coordinate. */
  timeAt(frame: LaneFrame, y: number): number {
    const g = this.geometry(frame);
    const v = frame.settings.scrollSpeed;
    return frame.settings.direction === 'down'
      ? frame.time + (g.judgeY - y) / v
      : frame.time + (y - g.judgeY) / v;
  }

  /** Lane under a canvas x coordinate (nearest lane when between or beside lanes). */
  laneAt(frame: Pick<LaneFrame, 'model' | 'settings' | 'overlay'>, x: number): number {
    const g = this.geometry(frame);
    let best = 0;
    let bestD = Infinity;
    g.laneX.forEach((lx, i) => {
      const d = Math.abs(x - (lx + g.laneW / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  hitTest(frame: LaneFrame, x: number, y: number): number {
    const g = this.geometry(frame);
    const lane = g.laneX.findIndex((lx) => x >= lx && x < lx + g.laneW);
    if (lane < 0) return -1;
    const t = this.timeAt(frame, y);
    const tol = Math.max(frame.settings.noteHeight, 12) / frame.settings.scrollSpeed;
    const noteTimes = frame.model.displayTimes;
    const lanes = frame.model.fingering.noteLane;
    let best = -1;
    let bestD = Infinity;
    for (let i = lowerBound(noteTimes, t - tol); i < noteTimes.length && noteTimes[i]! <= t + tol; i++) {
      if (lanes[i] !== lane) continue;
      const d = Math.abs(noteTimes[i]! - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private runEnds(model: ChartModel): Float64Array {
    if (this.runEndCache.model !== model) {
      this.runEndCache = { model, ends: Float64Array.from(model.analysis.runs, (r) => r.endTime) };
    }
    return this.runEndCache.ends;
  }

  draw(frame: LaneFrame): void {
    const c = this.ctx;
    const { model, settings: s, time } = frame;
    const { lanes, timing, analysis, fingering } = model;
    const g = this.geometry(frame);
    const down = s.direction === 'down';
    const v = s.scrollSpeed;
    const yOf = (t: number) => (down ? g.judgeY - (t - time) * v : g.judgeY + (t - time) * v);
    const tFuture = down ? time + g.judgeY / v : time + (this.h - g.judgeY) / v;
    const tPast = down ? time - (this.h - g.judgeY) / v : time - g.judgeY / v;
    const practice = s.mode === 'practice' && frame.judge !== null;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (frame.overlay) {
      c.clearRect(0, 0, this.w, this.h);
      c.fillStyle = 'rgba(20,20,22,0.62)';
    } else c.fillStyle = '#18181a';
    c.fillRect(0, 0, this.w, this.h);

    // Lane columns
    lanes.forEach((l, i) => {
      c.fillStyle = l.hand === 'L' ? 'rgba(142,197,255,0.05)' : 'rgba(255,146,148,0.05)';
      c.fillRect(g.laneX[i]!, 0, g.laneW, this.h);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(g.laneX[i]!, 0, 1, this.h);
    });
    c.fillRect(g.right, 0, 1, this.h);

    // Beat grid
    if (s.showBeatLines) {
      let drawn = 0;
      for (let si = 0; si < analysis.sections.length && drawn < 400; si++) {
        const sec = analysis.sections[si]!;
        const end = analysis.sections[si + 1]?.startTime ?? Infinity;
        const spb = 60 / sec.bpm;
        const lo = Math.max(tPast, sec.startTime);
        const hi = Math.min(tFuture, end);
        if (lo > hi) continue;
        const step = spb * v < 9 ? 4 : 1;
        for (
          let k = Math.ceil((lo - sec.startTime) / spb / step) * step;
          sec.startTime + k * spb <= hi;
          k += step
        ) {
          const y = Math.round(yOf(sec.startTime + k * spb));
          c.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.055)';
          c.fillRect(g.left, y, g.right - g.left, 1);
          if (++drawn >= 400) break;
        }
      }
    }

    // Section markers
    c.font = `600 11px ${FONT}`;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const sec of analysis.sections) {
      if (sec.startTime < tPast || sec.startTime > tFuture) continue;
      const y = Math.round(yOf(sec.startTime));
      c.fillStyle = 'rgba(242,201,122,0.55)';
      for (let x = g.left; x < g.right; x += 8) c.fillRect(x, y, 4, 1);
      c.fillStyle = '#f2c97a';
      c.fillText(`♩${+sec.bpm.toFixed(2)}`, g.left - 8, y);
    }

    // Loop markers
    for (const [t, label, color] of [
      [frame.loopA, 'A', '#9be3b6'],
      [frame.loopB, 'B', '#ff7a7a'],
    ] as const) {
      if (t == null || t < tPast || t > tFuture) continue;
      const y = Math.round(yOf(t));
      c.fillStyle = color;
      c.fillRect(g.left - 18, y, g.right - g.left + 18, 2);
      c.textAlign = 'left';
      c.fillText(label, g.left - 30, y);
    }

    // Notes
    const { notes } = timing;
    const noteTimes = model.displayTimes;
    const noteLane = fingering.noteLane;
    const noteEvent = analysis.noteEvent;
    const i0 = lowerBound(noteTimes, tPast - 1);
    const i1 = upperBound(noteTimes, tFuture + 0.05);
    const h = s.noteHeight;
    const laneFill = lanes.map((l) => laneColor(l));
    const ghost = new Float32Array(lanes.length);

    c.save();
    c.beginPath();
    if (down) c.rect(0, 0, this.w, g.keyTop - 2);
    else c.rect(0, g.keyTop + g.keyH + 2, this.w, this.h);
    c.clip();

    // Chord connectors under the notes: one-hand gestures in the hand colour (slanted for 90° doubles)
    for (let i = i0; i < i1; i++) {
      const ev = analysis.events[noteEvent[i]!]!;
      if (ev.noteCount < 2 || ev.firstNote !== i) continue;
      const firstLane = lanes[noteLane[i]!];
      c.lineWidth = ev.oneHand ? 3 : 2;
      c.strokeStyle = ev.oneHand && firstLane ? laneColor(firstLane, 0.85) : 'rgba(255,255,255,0.4)';
      c.beginPath();
      for (let k = 0; k < ev.noteCount; k++) {
        const x = g.laneX[noteLane[i + k]!]! + g.laneW / 2;
        const y = yOf(noteTimes[i + k]!);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${Math.max(8, Math.min(h - 1, 11))}px ${FONT}`;
    for (let i = i0; i < i1; i++) {
      const t = noteTimes[i]!;
      const dragging = frame.drag?.note === i;
      const lane = dragging ? frame.drag!.lane : noteLane[i]!;
      const ln = lanes[lane];
      if (!ln) continue;
      const note = notes[i]!;
      if (dragging && lane !== noteLane[i]) {
        const ox = g.laneX[noteLane[i]!]!;
        c.globalAlpha = 0.25;
        c.strokeStyle = '#ffffff';
        c.setLineDash([4, 3]);
        c.lineWidth = 1;
        c.strokeRect(ox + 3.5, yOf(t) - h / 2, g.laneW - 7, h);
        c.setLineDash([]);
      }
      const end = note.endTime;
      let alpha = 1;
      const code = frame.judge?.result[i] ?? 0;
      if (practice) {
        if (code === JUDGE.perfect || code === JUDGE.near || code === JUDGE.far || code === JUDGE.auto)
          continue;
        if (code === JUDGE.miss || code === JUDGE.skipped) alpha = 0.28;
      } else if (t < time) {
        if (frame.playing && time - t < 0.1) ghost[lane] = Math.max(ghost[lane]!, 1 - (time - t) / 0.1);
        alpha = 1 - (time - t) / 0.12;
        if (alpha <= 0 && !(end && end > time)) continue;
        alpha = Math.max(alpha, end && end > time ? 0.6 : 0);
      }
      const x = g.laneX[lane]!;
      const y = yOf(t);
      c.globalAlpha = alpha;
      if (end) {
        const y2 = yOf(end);
        c.fillStyle = laneColor(ln, 0.35);
        c.fillRect(x + g.laneW * 0.25, Math.min(y, y2), g.laneW * 0.5, Math.abs(y2 - y));
      }
      c.fillStyle = model.noteAuto[i] ? 'rgba(138,128,135,0.5)' : laneFill[lane]!;
      c.beginPath();
      c.roundRect(x + 3, y - h / 2, g.laneW - 6, h, 3);
      c.fill();
      const ev = analysis.events[noteEvent[i]!]!;
      c.fillStyle = divisionColor(ev.division);
      c.fillRect(x + 3, y - h / 2, 4, h);
      if (fingering.noteSource[i]) {
        c.fillStyle = fingering.noteSource[i] === 1 ? '#f2c97a' : '#ffffff';
        c.beginPath();
        c.arc(x + g.laneW - 9, y, 2.5, 0, Math.PI * 2);
        c.fill();
      }
      if (s.noteLabel !== 'none' && h >= 9) {
        c.fillStyle = 'rgba(26,22,24,0.88)';
        c.fillText(
          s.noteLabel === 'lane' ? String(lane + 1) : FINGER_SHORT[ln.finger],
          x + g.laneW / 2,
          y + 0.5,
        );
      }
      if (code === JUDGE.wrong) {
        c.globalAlpha = 1;
        c.strokeStyle = '#f2a2b8';
        c.lineWidth = 2;
        c.strokeRect(x + 2, y - h / 2 - 1, g.laneW - 4, h + 2);
        const pl = frame.judge!.pressedLane[i]!;
        if (pl >= 0 && g.laneX[pl] !== undefined) {
          c.fillStyle = '#f2a2b8';
          c.fillText('✕', g.laneX[pl]! + g.laneW / 2, y);
        }
      }
      if (dragging) {
        c.globalAlpha = 1;
        c.strokeStyle = '#f2c97a';
        c.lineWidth = 2;
        c.strokeRect(x + 1.5, y - h / 2 - 2, g.laneW - 3, h + 4);
      } else if (i === frame.hoverNote) {
        c.globalAlpha = 1;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.strokeRect(x + 1.5, y - h / 2 - 2, g.laneW - 3, h + 4);
      }
    }
    c.globalAlpha = 1;
    c.restore();

    // Judgement line
    c.shadowColor = 'rgba(255,146,148,0.85)';
    c.shadowBlur = 10;
    c.fillStyle = 'rgba(242,237,239,0.95)';
    c.fillRect(g.left - 4, g.judgeY - 1, g.right - g.left + 8, 2);
    c.shadowBlur = 0;

    // Keycaps
    lanes.forEach((ln, i) => {
      const x = g.laneX[i]!;
      const pressFlash = Math.max(0, 1 - (frame.perfNow - frame.pressAt[i]!) / 160);
      const glow = Math.max(frame.pressed[i] ? 1 : 0, pressFlash, practice ? 0 : ghost[i]!);
      c.fillStyle = '#242427';
      c.beginPath();
      c.roundRect(x + 3, g.keyTop, g.laneW - 6, g.keyH, 10);
      c.fill();
      if (glow > 0) {
        c.fillStyle = laneColor(ln, 0.18 + 0.5 * glow);
        c.fill();
        const grad = c.createLinearGradient(0, g.judgeY, 0, down ? g.judgeY - 140 : g.judgeY + 140);
        grad.addColorStop(0, laneColor(ln, 0.28 * glow));
        grad.addColorStop(1, laneColor(ln, 0));
        c.fillStyle = grad;
        c.fillRect(x, down ? g.judgeY - 140 : g.judgeY, g.laneW, 140);
      }
      c.fillStyle = glow > 0.5 ? '#1a1a1c' : '#f2edef';
      c.font = `700 14px ${FONT}`;
      c.fillText(keyLabel(model.profile.keys[i] ?? ''), x + g.laneW / 2, g.keyTop + 20);
      c.font = `500 10px ${FONT}`;
      c.fillStyle = glow > 0.5 ? 'rgba(26,26,28,0.8)' : laneColor(ln, 0.95);
      c.fillText(`${i + 1} · ${laneLabel(ln)}`, x + g.laneW / 2, g.keyTop + 41);
    });

    // Run labels
    if (g.labels) {
      const runs = analysis.runs;
      const ends = this.runEnds(model);
      let lastY = NaN;
      c.textAlign = 'left';
      for (let r = lowerBound(ends, tPast); r < runs.length && runs[r]!.startTime <= tFuture; r++) {
        const run = runs[r]!;
        if (run.eventCount < 3) continue;
        const y1 = yOf(run.startTime);
        const y2 = yOf(run.endTime);
        const color = runColor(fingering, r);
        const bx = g.right + 12;
        c.fillStyle = color;
        c.fillRect(bx, Math.min(y1, y2), 2, Math.max(2, Math.abs(y2 - y1)));
        c.fillRect(bx, y1 - 1, 7, 2);
        // Keep the label of a run that already started pinned just above the judgement line.
        const ly = down ? Math.min(y1, g.judgeY - 16) : Math.max(y1, g.judgeY + 16);
        if (down ? ly < y2 - 4 : ly > y2 + 4) continue;
        if (!Number.isNaN(lastY) && Math.abs(ly - lastY) < 30) continue;
        lastY = ly;
        c.font = `700 12px ${FONT}`;
        c.fillText(
          `${Math.round(run.effBpm)} BPM · ${divisionLabel(run.division, run.divisionRaw)}`,
          bx + 12,
          ly - 7,
        );
        c.font = `500 11px ${FONT}`;
        c.fillStyle = 'rgba(207,198,202,0.85)';
        c.fillText(`${formatOrder(fingering.runSeq[r] ?? [])} · ${run.eventCount}타`, bx + 12, ly + 8);
      }
    }

    // Judgement text
    const hit = frame.lastHit;
    if (practice && hit && frame.perfNow - hit.at < 500) {
      const a = 1 - (frame.perfNow - hit.at) / 500;
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.font = `800 22px ${FONT}`;
      c.fillStyle = JUDGE_COLOR[hit.code] ?? '#fff';
      const label = JUDGE_LABEL[hit.code as keyof typeof JUDGE_LABEL];
      const cx = (g.left + g.right) / 2;
      const cy = down ? g.judgeY - 70 : g.judgeY + 70;
      c.fillText(label, cx, cy);
      if (hit.code !== JUDGE.miss) {
        c.font = `600 12px ${FONT}`;
        c.fillText(formatMs(hit.offsetMs), cx, cy + 20);
      }
      c.globalAlpha = 1;
    }
  }
}
