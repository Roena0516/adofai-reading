import type { Level, LevelAction } from '../parse/level';
import { num, toBool } from '../parse/level';
import type { Timing } from '../timing/timing';
import type { EaseFn } from './ease';
import { ease } from './ease';
import { beatsToSeconds, eventTime } from './effects';
import { levelEvents } from './events';
import { vec2 } from './track';

/** Red, green, blue 0–255 and alpha 0–1. */
export type RGBA = [number, number, number, number];

/** "rrggbb" or "rrggbbaa" (ADOFAI colours), with an optional opacity in percent on top. */
export function hexColor(v: unknown, fallback: RGBA, opacity?: unknown): RGBA {
  let out = fallback;
  if (typeof v === 'string') {
    const s = v.replace(/^#/, '');
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) {
      out = [
        parseInt(s.slice(0, 2), 16),
        parseInt(s.slice(2, 4), 16),
        parseInt(s.slice(4, 6), 16),
        s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }
  if (opacity !== undefined)
    out = [out[0], out[1], out[2], out[3] * Math.max(0, Math.min(1, num(opacity, 100) / 100))];
  return out;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpColor = (a: RGBA, b: RGBA, u: number): RGBA => [
  lerp(a[0], b[0], u),
  lerp(a[1], b[1], u),
  lerp(a[2], b[2], u),
  lerp(a[3], b[3], u),
];
const progress = (t: number, t0: number, dur: number, e: EaseFn) =>
  dur > 0 ? e(Math.min(1, Math.max(0, (t - t0) / dur))) : t >= t0 ? 1 : 0;

/**
 * A number that tweens to each key's value over its duration, starting from wherever it was.
 * Each key's start value is worked out once, so reading it at a time is a binary search.
 */
export class NumTrack {
  private keys: Array<{ t0: number; dur: number; ease: EaseFn; to: number; from: number }> = [];
  private ready = true;
  constructor(private readonly initial: number) {}
  add(t0: number, dur: number, e: EaseFn, to: number): void {
    this.keys.push({ t0, dur, ease: e, to, from: 0 });
    this.ready = false;
  }
  finish(): void {
    this.keys.sort((a, b) => a.t0 - b.t0);
    let prev: (typeof this.keys)[number] | null = null;
    for (const k of this.keys) {
      k.from = prev ? lerp(prev.from, prev.to, progress(k.t0, prev.t0, prev.dur, prev.ease)) : this.initial;
      prev = k;
    }
    this.ready = true;
  }
  get size(): number {
    return this.keys.length;
  }
  at(t: number): number {
    if (!this.ready) this.finish();
    const keys = this.keys;
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (keys[mid]!.t0 <= t) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return this.initial;
    const k = keys[lo - 1]!;
    return lerp(k.from, k.to, progress(t, k.t0, k.dur, k.ease));
  }
}

/** The last value switched on at or before t (keys sorted by time). */
export function stepAt<T>(keys: Array<{ t: number; value: T }>, t: number, base: T): T {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? base : keys[lo - 1]!.value;
}

interface FlashKey {
  t0: number;
  dur: number;
  ease: EaseFn;
  from: RGBA;
  to: RGBA;
}

interface ShakeKey {
  t0: number;
  dur: number;
  strength: number;
  intensity: number;
  fadeOut: boolean;
  ease: EaseFn;
}

export interface BackgroundState {
  color: RGBA;
  /** File name inside the level folder ("" = none). */
  image: string;
  imageColor: RGBA;
  /** Percent of the camera movement the image follows (100 = fixed on screen). */
  parallax: [number, number];
  mode: string;
  lockRot: boolean;
  loop: boolean;
  unscaledSize: number;
}

export interface VfxState {
  flashBack: RGBA | null;
  flashFront: RGBA | null;
  /** Camera shake in tiles. */
  shake: [number, number];
  bloom: { intensity: number; threshold: number; color: RGBA };
  /** Filter name → intensity (0–100, sometimes more). Only filters above 0 are listed. */
  filters: Record<string, number>;
  background: BackgroundState;
}

/** The level's screen effects over time: flashes, shakes, bloom, filters, background and planet easing. */
export interface Vfx {
  at: (t: number) => VfxState;
  /** Eased share (0–1) of a floor's rotation done at linear share u, after SetPlanetRotation. */
  planetProgress: (floor: number, u: number) => number;
  /** Image files the effects use (backgrounds), to load up front. */
  images: string[];
  /** Whether anything at all is animated (so a renderer can skip work). */
  any: boolean;
}

function backgroundFrom(ev: Record<string, unknown>, prev: BackgroundState): BackgroundState {
  const [px, py] = vec2(ev.parallax);
  return {
    color: hexColor(ev.color ?? ev.backgroundColor, prev.color),
    image: typeof ev.bgImage === 'string' ? ev.bgImage : prev.image,
    imageColor: hexColor(ev.imageColor ?? ev.bgImageColor, prev.imageColor),
    parallax: [px ?? prev.parallax[0], py ?? prev.parallax[1]],
    mode: typeof ev.bgDisplayMode === 'string' ? ev.bgDisplayMode : prev.mode,
    lockRot: ev.lockRot !== undefined ? toBool(ev.lockRot, prev.lockRot) : prev.lockRot,
    loop: ev.loopBG !== undefined ? toBool(ev.loopBG, prev.loop) : prev.loop,
    // newer levels call it scalingRatio
    unscaledSize: num(ev.scalingRatio ?? ev.unscaledSize, prev.unscaledSize),
  };
}

/** Deterministic smooth noise in about −1…1 (a few incommensurate sines). */
function wobble(x: number, seed: number): number {
  return (
    (Math.sin(x * 1.7 + seed) +
      Math.sin(x * 2.93 + seed * 2.1) * 0.6 +
      Math.sin(x * 5.11 + seed * 0.7) * 0.3) /
    1.9
  );
}

const SHAKE_TILES = 0.35;

export function buildVfx(level: Level, timing: Timing): Vfx {
  const n = timing.tiles.length - 1;
  const raw = level.rawSettings;
  const byFloor = levelEvents(level);

  const flashes: { Background: FlashKey[]; Foreground: FlashKey[] } = { Background: [], Foreground: [] };
  const shakes: ShakeKey[] = [];
  const bloomIntensity = new NumTrack(0);
  const bloomThreshold = new NumTrack(50);
  const bloomColors: Array<{ t0: number; color: RGBA }> = [];
  const filters = new Map<string, NumTrack>();
  const filterTrack = (name: string) => {
    let tr = filters.get(name);
    if (!tr) filters.set(name, (tr = new NumTrack(0)));
    return tr;
  };
  const initialBg: BackgroundState = backgroundFrom(raw, {
    color: [0, 0, 0, 1],
    image: '',
    imageColor: [255, 255, 255, 1],
    parallax: [100, 100],
    mode: 'FitToScreen',
    lockRot: false,
    loop: false,
    unscaledSize: 100,
  });
  const backgrounds: Array<{ t0: number; state: BackgroundState }> = [];
  const filterEvents: Array<{ t: number; ev: LevelAction; f: number }> = [];
  const bgEvents: Array<{ t: number; ev: LevelAction }> = [];

  // planet easing per floor
  const easeName: string[] = new Array(n + 1);
  const easeParts = new Uint16Array(n + 1);
  const easeMirror = new Uint8Array(n + 1);
  let curEase = typeof raw.planetEase === 'string' ? raw.planetEase : 'Linear';
  let curParts = Math.max(1, Math.trunc(num(raw.planetEaseParts, 1)));
  let curMirror = raw.planetEasePartBehavior === 'Mirror';

  for (let f = 0; f <= n; f++) {
    for (const ev of byFloor[f] ?? []) {
      if (ev.active === false) continue;
      const t = eventTime(timing, f, ev.angleOffset);
      switch (ev.eventType) {
        case 'Flash': {
          const plane = ev.plane === 'Foreground' ? 'Foreground' : 'Background';
          flashes[plane].push({
            t0: t,
            dur: beatsToSeconds(timing, f, ev.duration ?? 1),
            ease: ease(ev.ease),
            from: hexColor(ev.startColor, [255, 255, 255, 1], ev.startOpacity),
            to: hexColor(ev.endColor, [255, 255, 255, 1], ev.endOpacity),
          });
          break;
        }
        case 'ShakeScreen':
          shakes.push({
            t0: t,
            dur: beatsToSeconds(timing, f, ev.duration ?? 1),
            strength: num(ev.strength, 100),
            intensity: num(ev.intensity, 100),
            fadeOut: toBool(ev.fadeOut, true),
            ease: ease(ev.ease),
          });
          break;
        case 'Bloom': {
          const dur = beatsToSeconds(timing, f, ev.duration ?? 0);
          const e = ease(ev.ease);
          bloomIntensity.add(t, dur, e, toBool(ev.enabled, true) ? num(ev.intensity, 100) : 0);
          if (ev.threshold !== undefined) bloomThreshold.add(t, dur, e, num(ev.threshold, 50));
          if (ev.color !== undefined)
            bloomColors.push({ t0: t, color: hexColor(ev.color, [255, 255, 255, 1]) });
          break;
        }
        case 'SetFilter':
          filterEvents.push({ t, ev, f });
          break;
        case 'CustomBackground':
          bgEvents.push({ t, ev });
          break;
        case 'SetPlanetRotation':
          curEase = typeof ev.ease === 'string' ? ev.ease : curEase;
          curParts = Math.max(1, Math.trunc(num(ev.easeParts, curParts)));
          if (ev.easePartBehavior !== undefined) curMirror = ev.easePartBehavior === 'Mirror';
          break;
      }
    }
    easeName[f] = curEase;
    easeParts[f] = curParts;
    easeMirror[f] = curMirror ? 1 : 0;
  }

  // filters in time order, so "disable others" switches off what is on at that moment
  filterEvents.sort((a, b) => a.t - b.t);
  for (const { t, ev, f } of filterEvents) {
    const name = typeof ev.filter === 'string' ? ev.filter : '';
    if (!name) continue;
    const dur = beatsToSeconds(timing, f, ev.duration ?? 0);
    const e = ease(ev.ease);
    if (toBool(ev.disableOthers, false))
      for (const [other, tr] of filters) if (other !== name) tr.add(t, 0, e, 0);
    filterTrack(name).add(t, dur, e, toBool(ev.enabled, true) ? num(ev.intensity, 100) : 0);
  }
  for (const tr of filters.values()) tr.finish();
  bloomIntensity.finish();
  bloomThreshold.finish();
  for (const list of Object.values(flashes)) list.sort((a, b) => a.t0 - b.t0);
  shakes.sort((a, b) => a.t0 - b.t0);
  bloomColors.sort((a, b) => a.t0 - b.t0);
  bgEvents.sort((a, b) => a.t - b.t);
  let bg = initialBg;
  for (const { t, ev } of bgEvents) backgrounds.push({ t0: t, state: (bg = backgroundFrom(ev, bg)) });

  const flashAt = (list: FlashKey[], t: number): RGBA | null => {
    let hit: FlashKey | null = null;
    for (const k of list) {
      if (k.t0 > t) break;
      hit = k;
    }
    if (!hit) return null;
    const c = lerpColor(hit.from, hit.to, progress(t, hit.t0, hit.dur, hit.ease));
    return c[3] > 0.001 ? c : null;
  };
  const eases = new Map<string, EaseFn>();
  const easeOf = (name: string) => {
    let e = eases.get(name);
    if (!e) eases.set(name, (e = ease(name)));
    return e;
  };

  const images = [...new Set([initialBg.image, ...backgrounds.map((b) => b.state.image)].filter(Boolean))];
  const any =
    flashes.Background.length +
      flashes.Foreground.length +
      shakes.length +
      bloomIntensity.size +
      filters.size >
      0 ||
    backgrounds.length > 0 ||
    !!initialBg.image;

  return {
    any,
    images,
    planetProgress: (floor, u) => {
      const f = Math.max(0, Math.min(n, floor));
      const name = easeName[f] ?? 'Linear';
      if (name === 'Linear') return u;
      const parts = easeParts[f] || 1;
      const e = easeOf(name);
      if (parts <= 1) return e(u);
      const seg = Math.min(parts - 1, Math.floor(u * parts));
      const local = u * parts - seg;
      const eased = easeMirror[f] && seg % 2 === 1 ? 1 - e(1 - local) : e(local);
      return (seg + eased) / parts;
    },
    at: (t) => {
      let shakeX = 0;
      let shakeY = 0;
      for (const s of shakes) {
        if (s.t0 > t) break;
        if (t >= s.t0 + s.dur) continue;
        const u = s.dur > 0 ? (t - s.t0) / s.dur : 1;
        const amp = (s.strength / 100) * SHAKE_TILES * (s.fadeOut ? 1 - s.ease(u) : 1);
        const freq = 2 + s.intensity * 0.3;
        shakeX += amp * wobble((t - s.t0) * freq, s.t0);
        shakeY += amp * wobble((t - s.t0) * freq, s.t0 + 17.3);
      }
      let color: RGBA = [255, 255, 255, 1];
      for (const c of bloomColors) {
        if (c.t0 > t) break;
        color = c.color;
      }
      const active: Record<string, number> = {};
      for (const [name, tr] of filters) {
        const v = tr.at(t);
        if (v > 0.01) active[name] = v;
      }
      let background = initialBg;
      for (const b of backgrounds) {
        if (b.t0 > t) break;
        background = b.state;
      }
      return {
        flashBack: flashAt(flashes.Background, t),
        flashFront: flashAt(flashes.Foreground, t),
        shake: [shakeX, shakeY],
        bloom: { intensity: bloomIntensity.at(t), threshold: bloomThreshold.at(t), color },
        filters: active,
        background,
      };
    },
  };
}
