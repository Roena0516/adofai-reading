import type { Tile, Timing } from '../timing/timing';
import { approxRel, lowerBound } from '../util/math';

/** A stretch of the chart that shares one musical (base) BPM. */
export interface BeatSection {
  startFloor: number;
  /** Song time (s) of beat 0 of this section. */
  startTime: number;
  bpm: number;
}

/** User-edited section: only floor and BPM are stored; time is derived from the chart. */
export interface SectionEdit {
  floor: number;
  bpm: number;
}

const SIMPLE_RATIOS: number[] = (() => {
  const out: number[] = [];
  for (let a = -8; a <= 8; a++) {
    for (const b of [-1, 0, 1]) {
      for (const c of [-1, 0, 1]) {
        const r = 2 ** a * 3 ** b * 5 ** c;
        if (c !== 0 && r < 2.5 && r > 0.4) continue;
        out.push(r);
      }
    }
  }
  return out;
})();

/** Whether a BPM ratio looks like a rhythm (8ths, triplets, …) rather than a tempo change. */
export function isSimpleRatio(r: number, tol = 0.004): boolean {
  if (!(r > 0) || !Number.isFinite(r)) return false;
  return SIMPLE_RATIOS.some((s) => Math.abs(r / s - 1) <= tol);
}

/** A gap (in beats) is "regular" when it sits on a 1/48 or 1/32 beat grid. */
export function isRegularBeats(d: number): boolean {
  if (!(d > 0)) return false;
  for (const g of [48, 32]) {
    const x = d * g;
    const r = Math.round(x);
    if (r >= 1 && Math.abs(x - r) <= 0.04) return true;
  }
  return false;
}

/** Bring a tile BPM to the octave closest to `ref` (840 next to 180 → 210). */
function nearestOctave(bpm: number, ref: number): number {
  const k = Math.round(Math.log2(ref / bpm));
  return bpm * 2 ** k;
}

/** Gaps shorter than this are pseudo chords and say nothing about the beat grid. */
const MIN_GAP = 0.025;
const WINDOW_GAPS = 24;
const WINDOW_BEATS = 12;
const MIN_WINDOW = 4;
const KEEP_SCORE = 0.8;

function regularity(times: Float64Array, from: number, bpm: number, refBpm: number): number {
  let total = 0;
  let ok = 0;
  const limit = times[from]! + (WINDOW_BEATS * 60) / refBpm;
  for (let i = from; i + 1 < times.length && total < WINDOW_GAPS; i++) {
    if (times[i]! > limit && total >= MIN_WINDOW) break;
    const g = times[i + 1]! - times[i]!;
    if (g < MIN_GAP) continue;
    total++;
    if (isRegularBeats((g * bpm) / 60)) ok++;
  }
  return total >= MIN_WINDOW ? ok / total : NaN;
}

/**
 * Custom levels encode rhythm through tile BPM and angle, so the tile BPM rarely equals the
 * song's tempo. A section boundary is placed where the tile BPM changes by a non-simple ratio,
 * the next notes stop fitting the current beat grid, and a candidate tempo makes them fit.
 */
export function detectSections(timing: Pick<Timing, 'tiles' | 'noteTimes'>): BeatSection[] {
  const { tiles, noteTimes } = timing;
  const n = tiles.length - 1;
  const firstFloor = Math.min(1, n);
  let base = tiles[0]!.bpm;
  const sections: BeatSection[] = [{ startFloor: 0, startTime: tiles[firstFloor]!.time, bpm: base }];
  if (n < 1 || noteTimes.length < 2) return sections;

  let prevBpm = tiles[0]!.bpm;
  for (let f = 1; f < n; f++) {
    const bpm = tiles[f]!.bpm;
    if (approxRel(bpm, prevBpm, 1e-9)) continue;
    prevBpm = bpm;
    if (isSimpleRatio(bpm / base)) continue;

    const at = lowerBound(noteTimes, tiles[f]!.time - 1e-6);
    if (at >= noteTimes.length - 1) break;
    const keep = regularity(noteTimes, at, base, base);
    if (!(keep < KEEP_SCORE)) continue;

    // Candidate tempos: tile BPMs that appear in the coming window, moved near the current base.
    const horizon = tiles[f]!.time + (WINDOW_BEATS * 60) / base;
    const candidates = new Set<number>();
    for (let g = f; g < n && tiles[g]!.time <= horizon; g++) {
      candidates.add(Number(nearestOctave(tiles[g]!.bpm, base).toFixed(6)));
    }
    let best = base;
    let bestScore = keep;
    for (const c of candidates) {
      const score = regularity(noteTimes, at, c, base);
      if (score > bestScore + 1e-9) {
        best = c;
        bestScore = score;
      }
    }
    if (best !== base && bestScore >= KEEP_SCORE && bestScore >= keep + 0.2) {
      base = best;
      sections.push({ startFloor: f, startTime: tiles[f]!.time, bpm: base });
    }
  }
  return sections;
}

/** Turn user edits into sections sorted by floor, with times taken from the chart. */
export function resolveSections(edits: SectionEdit[], tiles: Tile[]): BeatSection[] {
  const n = tiles.length - 1;
  const valid = edits
    .filter((e) => e.bpm > 0 && Number.isFinite(e.floor))
    .map((e) => ({ floor: Math.max(0, Math.min(n, Math.trunc(e.floor))), bpm: e.bpm }))
    .sort((a, b) => a.floor - b.floor);
  if (!valid.length) return [];
  const out: BeatSection[] = [];
  for (const e of valid) {
    const startFloor = e.floor === 0 ? Math.min(1, n) : e.floor;
    const prev = out[out.length - 1];
    if (prev && prev.startFloor === startFloor) prev.bpm = e.bpm;
    else out.push({ startFloor, startTime: tiles[startFloor]!.time, bpm: e.bpm });
  }
  if (out[0]!.startFloor > Math.min(1, n)) {
    out.unshift({ startFloor: Math.min(1, n), startTime: tiles[Math.min(1, n)]!.time, bpm: out[0]!.bpm });
  }
  return out;
}
