import type { Level } from '../parse/level';
import { num, toBool } from '../parse/level';
import type { Timing } from '../timing/timing';
import type { TrackLook } from './color';
import { lookFrom } from './color';
import type { EaseFn } from './ease';
import { ease } from './ease';
import { resolveFloor, vec2 } from './track';

/** One MoveTrack applied to one tile. Channels: dx, dy, rotation, scaleX, scaleY, opacity (null = untouched). */
export interface TileTween {
  t0: number;
  dur: number;
  ease: EaseFn;
  v: Array<number | null>;
}

export const TRACK_ANIMS = [
  'None',
  'Fade',
  'Extend',
  'Grow',
  'Grow_Spin',
  'Assemble',
  'Assemble_Far',
  'Drop',
  'Rise',
  'Scatter',
  'Scatter_Far',
  'Retract',
  'Shrink',
  'Shrink_Spin',
] as const;
const animCode = (v: unknown) => Math.max(0, TRACK_ANIMS.indexOf(v as (typeof TRACK_ANIMS)[number]));

export interface TrackEffects {
  tweens: Array<TileTween[] | undefined>;
  /** Time each tile starts to appear / disappear (±Infinity when it never animates). */
  appearAt: Float64Array;
  appearAnim: Uint8Array;
  disappearAt: Float64Array;
  disappearAnim: Uint8Array;
  animDur: Float64Array;
  looks: TrackLook[];
  lookBase: Uint16Array;
  recolors: Array<Array<{ t: number; look: number }> | undefined>;
  stickToFloors: boolean;
  backgroundColor: [number, number, number];
}

export interface TileState {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  opacity: number;
}

const DEFAULTS = [0, 0, 0, 1, 1, 1];

/** Channels (dx, dy, rot, sx, sy, opacity) an appear animation brings back to the tile's own value. */
const APPEAR_RESETS: Partial<Record<(typeof TRACK_ANIMS)[number], number[]>> = {
  Fade: [5],
  Extend: [3, 4],
  Grow: [3, 4],
  Retract: [3, 4],
  Shrink: [3, 4],
  Grow_Spin: [2, 3, 4],
  Shrink_Spin: [2, 3, 4],
  Assemble: [0, 1],
  Assemble_Far: [0, 1],
  Scatter: [0, 1],
  Scatter_Far: [0, 1],
  Drop: [0, 1],
  Rise: [0, 1],
};

/** Song time of an event on floor f, delayed by angleOffset degrees of rotation. */
export function eventTime(timing: Timing, f: number, angleOffset: unknown): number {
  const tile = timing.tiles[f]!;
  return tile.time + (num(angleOffset, 0) / 180) * (60 / tile.bpm);
}

export function beatsToSeconds(timing: Timing, f: number, beats: unknown): number {
  return Math.max(0, num(beats, 0)) * (60 / timing.tiles[f]!.bpm);
}

/** Collect MoveTrack, AnimateTrack, ColorTrack and RecolorTrack into per-tile timelines. */
export function buildTrackEffects(level: Level, timing: Timing): TrackEffects {
  const n = timing.tiles.length - 1;
  const raw = level.rawSettings;
  const tweens: Array<TileTween[] | undefined> = new Array(n + 1);
  const recolors: Array<Array<{ t: number; look: number }> | undefined> = new Array(n + 1);
  const looks: TrackLook[] = [lookFrom(raw)];
  const lookBase = new Uint16Array(n + 1);

  let anim = animCode(raw.trackAnimation);
  let ahead = num(raw.beatsAhead, 3);
  let dAnim = animCode(raw.trackDisappearAnimation);
  let behind = num(raw.beatsBehind, 4);
  const appearAt = new Float64Array(n + 1);
  const appearAnim = new Uint8Array(n + 1);
  const disappearAt = new Float64Array(n + 1);
  const disappearAnim = new Uint8Array(n + 1);
  const animDur = new Float64Array(n + 1);
  let currentLook = 0;

  for (let f = 0; f <= n; f++) {
    for (const ev of level.actionsByFloor[f] ?? []) {
      if (ev.active === false) continue;
      switch (ev.eventType) {
        case 'MoveTrack': {
          const from = resolveFloor(ev.startTile, f, n);
          const to = resolveFloor(ev.endTile, f, n);
          const step = Math.max(1, Math.trunc(num(ev.gapLength, 0)) + 1);
          const [dx, dy] = vec2(ev.positionOffset);
          const [sx, sy] = vec2(ev.scale);
          const op = ev.opacity;
          const rot = ev.rotationOffset;
          const tween: TileTween = {
            t0: eventTime(timing, f, ev.angleOffset),
            dur: beatsToSeconds(timing, f, ev.duration),
            ease: ease(ev.ease),
            v: [
              dx,
              dy,
              typeof rot === 'number' ? rot : null,
              sx == null ? null : sx / 100,
              sy == null ? null : sy / 100,
              typeof op === 'number' ? op / 100 : null,
            ],
          };
          for (let g = Math.min(from, to); g <= Math.max(from, to); g += step) (tweens[g] ??= []).push(tween);
          break;
        }
        case 'AnimateTrack':
          if (ev.trackAnimation !== undefined) anim = animCode(ev.trackAnimation);
          if (ev.beatsAhead !== undefined) ahead = num(ev.beatsAhead, ahead);
          if (ev.trackDisappearAnimation !== undefined) dAnim = animCode(ev.trackDisappearAnimation);
          if (ev.beatsBehind !== undefined) behind = num(ev.beatsBehind, behind);
          break;
        case 'ColorTrack': {
          looks.push(lookFrom(ev, looks[currentLook]));
          const idx = looks.length - 1;
          if (toBool(ev.justThisTile, false)) lookBase[f] = idx;
          else currentLook = idx;
          break;
        }
        case 'RecolorTrack': {
          const from = resolveFloor(ev.startTile, f, n);
          const to = resolveFloor(ev.endTile, f, n);
          const step = Math.max(1, Math.trunc(num(ev.gapLength, 0)) + 1);
          looks.push(lookFrom(ev, looks[currentLook]));
          const key = { t: eventTime(timing, f, ev.angleOffset), look: looks.length - 1 };
          for (let g = Math.min(from, to); g <= Math.max(from, to); g += step) (recolors[g] ??= []).push(key);
          break;
        }
      }
    }
    if (!lookBase[f]) lookBase[f] = currentLook;
    const spb = 60 / timing.tiles[Math.max(0, f - 1)]!.bpm;
    appearAnim[f] = anim;
    disappearAnim[f] = dAnim;
    animDur[f] = Math.min(0.6, Math.max(0.12, spb * 0.5));
    appearAt[f] = anim ? timing.tiles[f]!.time - ahead * spb : -Infinity;
    const leave = timing.tiles[Math.min(n, f + 1)]!.time;
    disappearAt[f] = dAnim ? leave + behind * spb : Infinity;
  }
  // When a tile plays its appear animation the game tweens what that animation controls back to the
  // tile's own values, so a MoveTrack that hid the tile beforehand (scale 0, then "Extend") is undone.
  // A MoveTrack still running at that moment keeps overwriting the value, so it is left alone.
  for (let f = 0; f <= n; f++) {
    const channels = APPEAR_RESETS[TRACK_ANIMS[appearAnim[f]!]!];
    const at = appearAt[f]!;
    if (!channels || !Number.isFinite(at)) continue;
    const list = tweens[f] ?? [];
    const v: Array<number | null> = [null, null, null, null, null, null];
    let any = false;
    for (const c of channels) {
      const running = list.some((tw) => tw.v[c] != null && tw.dur > 0 && tw.t0 <= at && tw.t0 + tw.dur > at);
      if (running) continue;
      v[c] = DEFAULTS[c]!;
      any = true;
    }
    if (any) list.push({ t0: at, dur: 0, ease: (u) => u, v });
    if (list.length) tweens[f] = list;
  }
  for (const list of tweens) list?.sort((a, b) => a.t0 - b.t0);
  for (const list of recolors) list?.sort((a, b) => a.t - b.t);

  return {
    tweens,
    appearAt,
    appearAnim,
    disappearAt,
    disappearAnim,
    animDur,
    looks,
    lookBase,
    recolors,
    stickToFloors: toBool(raw.stickToFloors, false),
    backgroundColor: (() => {
      const v = raw.backgroundColor;
      if (typeof v !== 'string' || !/^[0-9a-f]{6}/i.test(v)) return [0, 0, 0] as [number, number, number];
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] as [
        number,
        number,
        number,
      ];
    })(),
  };
}

/** MoveTrack state of a tile at time t. */
export function tileStateAt(fx: TrackEffects, floor: number, t: number, out?: TileState): TileState {
  const res = out ?? { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, opacity: 1 };
  const list = fx.tweens[floor];
  const vals = [0, 0, 0, 0, 0, 0];
  for (let c = 0; c < 6; c++) {
    let from = DEFAULTS[c]!;
    let to = from;
    let t0 = -Infinity;
    let dur = 0;
    let e: EaseFn = (u) => u;
    if (list) {
      for (const tw of list) {
        if (tw.t0 > t) break;
        const target = tw.v[c];
        if (target == null) continue;
        const u = dur > 0 ? Math.min(1, Math.max(0, (tw.t0 - t0) / dur)) : 1;
        from = from + (to - from) * e(u);
        to = target;
        t0 = tw.t0;
        dur = tw.dur;
        e = tw.ease;
      }
    }
    const u = dur > 0 ? Math.min(1, Math.max(0, (t - t0) / dur)) : 1;
    vals[c] = from + (to - from) * e(u);
  }
  res.dx = vals[0]!;
  res.dy = vals[1]!;
  res.rot = vals[2]!;
  res.sx = vals[3]!;
  res.sy = vals[4]!;
  res.opacity = vals[5]!;
  return res;
}

export interface TileAppearance {
  /** 0 = not shown yet / gone, 1 = fully shown. */
  alpha: number;
  scale: number;
  spin: number;
  dx: number;
  dy: number;
}

function hashDir(floor: number): [number, number] {
  const a = ((Math.sin(floor * 12.9898) * 43758.5453) % 1) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/** Effect of AnimateTrack appear/disappear animations on a tile at time t. */
export function tileAppearance(fx: TrackEffects, floor: number, t: number): TileAppearance {
  const res: TileAppearance = { alpha: 1, scale: 1, spin: 0, dx: 0, dy: 0 };
  const dur = fx.animDur[floor]!;
  const apply = (code: number, u: number, appearing: boolean) => {
    // u: 0 = hidden, 1 = fully visible
    const name = TRACK_ANIMS[code];
    const k = 1 - u;
    switch (name) {
      case 'Fade':
        res.alpha *= u;
        break;
      case 'Extend':
      case 'Retract':
      case 'Grow':
      case 'Shrink':
        res.scale *= u;
        res.alpha *= Math.min(1, u * 2);
        break;
      case 'Grow_Spin':
      case 'Shrink_Spin':
        res.scale *= u;
        res.spin += (appearing ? -1 : 1) * k * 180;
        break;
      case 'Assemble':
      case 'Assemble_Far':
      case 'Scatter':
      case 'Scatter_Far': {
        const far = name.endsWith('Far') ? 6 : 2;
        const [ux, uy] = hashDir(floor);
        res.dx += ux * far * k;
        res.dy += uy * far * k;
        res.alpha *= u;
        break;
      }
      case 'Drop':
        res.dy += 3 * k;
        res.alpha *= u;
        break;
      case 'Rise':
        res.dy -= 3 * k;
        res.alpha *= u;
        break;
    }
  };
  const a = fx.appearAt[floor]!;
  if (fx.appearAnim[floor] && t < a + dur) {
    if (t < a) return { ...res, alpha: 0 };
    apply(fx.appearAnim[floor]!, (t - a) / dur, true);
  }
  const d = fx.disappearAt[floor]!;
  if (fx.disappearAnim[floor] && t > d) {
    if (t > d + dur) return { ...res, alpha: 0 };
    apply(fx.disappearAnim[floor]!, 1 - (t - d) / dur, false);
  }
  return res;
}

export function tileLook(fx: TrackEffects, floor: number, t: number): TrackLook {
  const list = fx.recolors[floor];
  let idx = fx.lookBase[floor]!;
  if (list) for (const r of list) if (r.t <= t) idx = r.look;
  return fx.looks[idx]!;
}
