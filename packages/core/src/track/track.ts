import type { LevelAction } from '../parse/level';
import { num, toBool } from '../parse/level';
import { MIDSPIN } from '../parse/pathData';
import type { Timing } from '../timing/timing';
import { upperBound } from '../util/math';

/** Tile layout in track units (one unit = distance between neighbouring tiles; y points up). */
export interface Track {
  /** Tile centres after PositionTrack. */
  x: Float64Array;
  y: Float64Array;
  /** Effective exit direction of each floor in degrees (midspins resolved); NaN for the last floor. */
  dir: Float64Array;
  /** Static per-tile rotation (deg), scale and opacity from PositionTrack. */
  baseRot: Float32Array;
  baseScale: Float32Array;
  baseOpacity: Float32Array;
}

export function vec2(v: unknown): [number | null, number | null] {
  if (Array.isArray(v)) {
    const a = v[0];
    const b = v[1];
    return [typeof a === 'number' ? a : null, typeof b === 'number' ? b : null];
  }
  if (typeof v === 'number') return [v, v];
  return [null, null];
}

/** Resolve an ADOFAI tile reference such as [-1, "ThisTile"], [40, "Start"] or [0, "End"]. */
export function resolveFloor(ref: unknown, here: number, last: number): number {
  if (!Array.isArray(ref)) return here;
  const n = typeof ref[0] === 'number' ? Math.trunc(ref[0]) : 0;
  const mode = ref[1];
  const f = mode === 'Start' ? n : mode === 'End' ? last + n : here + n;
  return Math.max(0, Math.min(last, f));
}

/**
 * Lay the tiles out the way the game does: each floor sits one unit from the previous one in
 * the previous floor's exit direction. A midspin points back the way it came (its direction is
 * the previous one + 180°), so the floor after it sits on the tile before the midspin, which is
 * where the timing model puts the pivot planet. PositionTrack shifts a tile (and, unless
 * justThisTile, every tile after it).
 */
export function computeTrack(angles: ArrayLike<number>, actionsByFloor?: LevelAction[][]): Track {
  const n = angles.length;
  const x = new Float64Array(n + 1);
  const y = new Float64Array(n + 1);
  const dir = new Float64Array(n + 1).fill(Number.NaN);
  const baseRot = new Float32Array(n + 1);
  const baseScale = new Float32Array(n + 1).fill(1);
  const baseOpacity = new Float32Array(n + 1).fill(1);
  let cx = 0;
  let cy = 0;
  let eff = 0;
  for (let f = 0; f <= n; f++) {
    let px = cx;
    let py = cy;
    let justThis = false;
    for (const ev of actionsByFloor?.[f] ?? []) {
      if (ev.eventType !== 'PositionTrack' || ev.active === false || toBool(ev.editorOnly, false)) continue;
      const [ox, oy] = vec2(ev.positionOffset);
      const ref = resolveFloor(ev.relativeTo, f, n);
      if (ref < f) {
        px = x[ref]! + (ox ?? 0);
        py = y[ref]! + (oy ?? 0);
      } else {
        px += ox ?? 0;
        py += oy ?? 0;
      }
      baseRot[f] = num(ev.rotation, 0);
      baseScale[f] = num(Array.isArray(ev.scale) ? ev.scale[0] : ev.scale, 100) / 100;
      baseOpacity[f] = num(ev.opacity, 100) / 100;
      justThis = toBool(ev.justThisTile, false);
    }
    x[f] = px;
    y[f] = py;
    if (!justThis) {
      cx = px;
      cy = py;
    }
    if (f < n) {
      const a = angles[f]!;
      eff = a === MIDSPIN ? (f === 0 ? 180 : eff + 180) : a;
      dir[f] = eff;
      const r = (eff * Math.PI) / 180;
      cx += Math.cos(r);
      cy += Math.sin(r);
    }
  }
  return { x, y, dir, baseRot, baseScale, baseOpacity };
}

export interface PlanetState {
  /** Floor the pivot planet stands on. */
  floor: number;
  pivotX: number;
  pivotY: number;
  /** Direction (degrees) from the pivot to the orbiting planet. */
  angle: number;
  /** Which planet is the pivot: 0 = fire (red), 1 = ice (blue). */
  pivotPlanet: 0 | 1;
}

/** Floor the pivot planet stands on at song time t. */
export function floorAt(timing: Pick<Timing, 'tiles'>, t: number): number {
  const times = tileTimes(timing);
  let k = Math.max(0, upperBound(times, t) - 1);
  while (k + 1 < times.length && times[k + 1]! <= t) k++;
  return k;
}

/**
 * Where the two planets are at song time t. `ease` maps the linear share of a floor's turn to the
 * share actually done (SetPlanetRotation); the planet still reaches the next floor on time.
 */
export function planetsAt(
  timing: Pick<Timing, 'tiles'>,
  track: Track,
  t: number,
  ease?: (floor: number, u: number) => number,
): PlanetState {
  const k = floorAt(timing, t);
  const tile = timing.tiles[k]!;
  let progress = 0;
  if (tile.duration > 0) {
    const total = tile.rotation + tile.pauseBeats * 180 + tile.holdTurns * 360;
    const u = Math.min(1, Math.max(0, t - tile.time) / tile.duration);
    progress = (ease ? ease(k, u) : u) * total;
  }
  const angle = tile.entry + (tile.clockwise ? -progress : progress);
  return { floor: k, pivotX: track.x[k]!, pivotY: track.y[k]!, angle, pivotPlanet: (k % 2) as 0 | 1 };
}

const timesCache = new WeakMap<object, Float64Array>();
export function tileTimes(timing: Pick<Timing, 'tiles'>): Float64Array {
  let cached = timesCache.get(timing.tiles);
  if (!cached) {
    cached = Float64Array.from(timing.tiles, (t) => t.time);
    timesCache.set(timing.tiles, cached);
  }
  return cached;
}
