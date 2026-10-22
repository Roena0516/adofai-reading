import type { Level } from '../parse/level';
import { num } from '../parse/level';
import type { Timing } from '../timing/timing';
import { upperBound } from '../util/math';
import type { EaseFn } from './ease';
import { ease } from './ease';
import type { TrackEffects } from './effects';
import { beatsToSeconds, eventTime, tileStateAt } from './effects';
import type { Track } from './track';
import { tileTimes, vec2 } from './track';

export interface CameraView {
  x: number;
  y: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
  /** Percent; 200 shows twice as much as 100. */
  zoom: number;
}

export interface CameraOptions {
  /** How fast the camera catches up with the planet (1/s). Infinity = no lag. */
  follow: number;
  /** Apply MoveCamera events; when false the camera just follows the planet. */
  events: boolean;
}

interface PosKey {
  t: number;
  dur: number;
  ease: EaseFn;
  player: boolean;
  /** Offset from the planet (player mode) or the fixed point. */
  ox: number;
  oy: number;
  fromX: number;
  fromY: number;
}

interface NumKey {
  t: number;
  dur: number;
  ease: EaseFn;
  from: number;
  to: number;
}

const progress = (t: number, t0: number, dur: number, e: EaseFn) =>
  dur > 0 ? e(Math.min(1, Math.max(0, (t - t0) / dur))) : 1;

/**
 * The game camera over time: it eases after the pivot planet (the lag the game has) and follows
 * MoveCamera events (Player / Tile / Global / LastPosition, rotation, zoom, easing).
 * Everything is a pure function of song time so seeking and slow playback stay consistent.
 */
export class CameraTimeline {
  private readonly landT: Float64Array;
  private readonly landX: Float64Array;
  private readonly landY: Float64Array;
  private readonly pos: PosKey[] = [];
  private readonly rot: NumKey[] = [];
  private readonly zoom: NumKey[] = [];
  private readonly posT: Float64Array;
  private readonly rotT: Float64Array;
  private readonly zoomT: Float64Array;

  constructor(
    level: Level,
    timing: Timing,
    track: Track,
    fx: TrackEffects | null,
    private readonly opts: CameraOptions,
  ) {
    const n = timing.tiles.length - 1;
    this.landT = tileTimes(timing);
    this.landX = new Float64Array(n + 1);
    this.landY = new Float64Array(n + 1);
    // The planet lands where its tile is at that moment, MoveTrack offsets included (stickToFloors
    // only decides whether it keeps following the tile afterwards).
    for (let k = 0; k <= n; k++) {
      let dx = 0;
      let dy = 0;
      if (fx) {
        const st = tileStateAt(fx, k, this.landT[k]!);
        dx = st.dx;
        dy = st.dy;
      }
      this.landX[k] = track.x[k]! + dx;
      this.landY[k] = track.y[k]! + dy;
    }

    const raw = level.rawSettings;
    const [sx, sy] = vec2(raw.position);
    const initialRel = typeof raw.relativeTo === 'string' ? raw.relativeTo : 'Player';
    const initialPlayer = !['Tile', 'Global'].includes(initialRel);
    const anchorX = initialRel === 'Tile' && !initialPlayer ? track.x[0]! : 0;
    const anchorY = initialRel === 'Tile' && !initialPlayer ? track.y[0]! : 0;
    this.pos.push({
      t: -Infinity,
      dur: 0,
      ease: (u) => u,
      player: initialPlayer,
      ox: (sx ?? 0) + anchorX,
      oy: (sy ?? 0) + anchorY,
      fromX: 0,
      fromY: 0,
    });
    this.rot.push({
      t: -Infinity,
      dur: 0,
      ease: (u) => u,
      from: num(raw.rotation, 0),
      to: num(raw.rotation, 0),
    });
    this.zoom.push({
      t: -Infinity,
      dur: 0,
      ease: (u) => u,
      from: num(raw.zoom, 100),
      to: num(raw.zoom, 100),
    });

    if (opts.events) {
      const events: Array<{ t: number; f: number; ev: Record<string, unknown> }> = [];
      for (let f = 0; f <= n; f++) {
        for (const ev of level.actionsByFloor[f] ?? []) {
          if (ev.eventType === 'MoveCamera' && ev.active !== false)
            events.push({ t: eventTime(timing, f, ev.angleOffset), f, ev });
        }
      }
      events.sort((a, b) => a.t - b.t);
      for (const { t, f, ev } of events) {
        const dur = beatsToSeconds(timing, f, ev.duration);
        const e = ease(ev.ease);
        const rel = typeof ev.relativeTo === 'string' ? ev.relativeTo : null;
        const [px, py] = vec2(ev.position);
        if (rel !== null || px !== null || py !== null) {
          const prev = this.pos[this.pos.length - 1]!;
          const [fromX, fromY] = this.positionAt(t);
          let player = prev.player;
          let ox = prev.ox;
          let oy = prev.oy;
          if (rel === 'Player') {
            player = true;
            ox = px ?? 0;
            oy = py ?? 0;
          } else if (rel === 'Tile') {
            // legacyCamRelativeTo used the planet's tile when the event fires, which is this floor.
            player = false;
            ox = this.landX[f]! + (px ?? 0);
            oy = this.landY[f]! + (py ?? 0);
          } else if (rel === 'Global') {
            player = false;
            ox = px ?? 0;
            oy = py ?? 0;
          } else {
            // LastPosition / LastPositionNoRotation / missing: relative to the previous setting
            ox += px ?? 0;
            oy += py ?? 0;
          }
          this.pos.push({ t, dur, ease: e, player, ox, oy, fromX, fromY });
        }
        if (typeof ev.rotation === 'number') {
          this.rot.push({ t, dur, ease: e, from: this.numAt(this.rot, t), to: ev.rotation });
        }
        if (typeof ev.zoom === 'number') {
          this.zoom.push({ t, dur, ease: e, from: this.numAt(this.zoom, t), to: ev.zoom });
        }
      }
    }
    this.posT = Float64Array.from(this.pos, (k) => k.t);
    this.rotT = Float64Array.from(this.rot, (k) => k.t);
    this.zoomT = Float64Array.from(this.zoom, (k) => k.t);
  }

  /** The pivot planet as the camera sees it: eases towards each new tile instead of jumping. */
  playerAt(t: number): [number, number] {
    const k = Math.max(0, upperBound(this.landT, t) - 1);
    let x = this.landX[k]!;
    let y = this.landY[k]!;
    const follow = this.opts.follow;
    if (!Number.isFinite(follow)) return [x, y];
    const window = 7 / follow;
    for (let j = k; j >= 1 && t - this.landT[j]! < window; j--) {
      const w = Math.exp(-follow * (t - this.landT[j]!));
      x -= (this.landX[j]! - this.landX[j - 1]!) * w;
      y -= (this.landY[j]! - this.landY[j - 1]!) * w;
    }
    return [x, y];
  }

  private positionAt(t: number): [number, number] {
    const keys = this.pos;
    let i = keys.length - 1;
    while (i > 0 && keys[i]!.t > t) i--;
    return this.evalPos(keys[i]!, t);
  }

  private evalPos(k: PosKey, t: number): [number, number] {
    let tx = k.ox;
    let ty = k.oy;
    if (k.player) {
      const [x, y] = this.playerAt(t);
      tx += x;
      ty += y;
    }
    if (!Number.isFinite(k.t)) return [tx, ty];
    const u = progress(t, k.t, k.dur, k.ease);
    return [k.fromX + (tx - k.fromX) * u, k.fromY + (ty - k.fromY) * u];
  }

  private numAt(keys: NumKey[], t: number, times?: Float64Array): number {
    let i: number;
    if (times) i = Math.max(0, upperBound(times, t) - 1);
    else {
      i = keys.length - 1;
      while (i > 0 && keys[i]!.t > t) i--;
    }
    const k = keys[i]!;
    return k.from + (k.to - k.from) * progress(t, k.t, k.dur, k.ease);
  }

  at(t: number): CameraView {
    const pi = Math.max(0, upperBound(this.posT, t) - 1);
    const [x, y] = this.evalPos(this.pos[pi]!, t);
    return {
      x,
      y,
      rotation: this.numAt(this.rot, t, this.rotT),
      zoom: Math.max(5, this.numAt(this.zoom, t, this.zoomT)),
    };
  }
}
