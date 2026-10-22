import type { Finger, FingeringResult, Hand, Lane } from '@adofai-reading/core';

// Right hand = carol accent coral (#ff9294), left hand = a matching sky blue (#8ec5ff).
const HUE: Record<Hand, number> = { L: 210, R: 358 };
const SAT: Record<Finger, number> = { thumb: 12, index: 100, middle: 90, ring: 78, pinky: 66 };
const LIGHT: Record<Finger, number> = { thumb: 76, index: 78, middle: 69, ring: 61, pinky: 54 };

export function laneColor(l: Lane, alpha = 1): string {
  return `hsla(${HUE[l.hand]}, ${SAT[l.finger]}%, ${LIGHT[l.finger]}%, ${alpha})`;
}

export const HAND_COLOR: Record<Hand, string> = { L: '#8ec5ff', R: '#ff9294' };

const BAND = ['#8a8087', '#8ec5ff', '#c6a8ff', '#ff9294', '#f2c97a', '#9be3b6', '#f2b3bf', '#7fd1d8'];
export function bandColor(i: number): string {
  return i < 0 ? '#6f676c' : BAND[i % BAND.length]!;
}

/** Palette slot per key count, so 2키 and 4키 bases colour the same key count alike. */
const KEY_SLOT: Record<number, number> = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 4, 3: 5 };

/** Colour of a run: by its key count in the simple layout, by band for hand-edited orders. */
export function runColor(
  fingering: Pick<FingeringResult, 'runBase' | 'runBand' | 'runSeq'>,
  r: number,
): string {
  if (fingering.runBase[r]) return bandColor(KEY_SLOT[fingering.runSeq[r]?.length ?? 0] ?? -1);
  return bandColor(fingering.runBand[r] ?? -1);
}

const DIVISION: Record<string, string> = {
  '1': '#ef4444',
  '2': '#3b82f6',
  '3': '#a855f7',
  '4': '#eab308',
  '6': '#ec4899',
  '8': '#f97316',
  '12': '#14b8a6',
  '16': '#e2e8f0',
  '24': '#84cc16',
  '32': '#94a3b8',
};
export function divisionColor(div: number | null): string {
  if (div == null) return '#3a353d';
  return DIVISION[String(div)] ?? '#6f676c';
}

export const JUDGE_COLOR: Record<number, string> = {
  1: '#8ec5ff',
  2: '#f5e35a',
  3: '#ff6a4e',
  4: '#ff7a7a',
  5: '#f2a2b8',
  8: '#ff6a4e',
};
