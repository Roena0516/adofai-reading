import { mod } from '../util/math';

/** angleData value that marks a midspin tile. */
export const MIDSPIN = 999;

/** Legacy pathData letters → absolute tile direction in degrees (0 = right, counter-clockwise positive). */
export const PATH_ABSOLUTE: Readonly<Record<string, number>> = {
  R: 0,
  p: 15,
  J: 30,
  E: 45,
  T: 60,
  o: 75,
  U: 90,
  q: 105,
  G: 120,
  Q: 135,
  H: 150,
  W: 165,
  L: 180,
  x: 195,
  N: 210,
  Z: 225,
  F: 240,
  V: 255,
  D: 270,
  Y: 285,
  B: 300,
  C: 315,
  M: 330,
  A: 345,
};

/**
 * Relative pathData characters (polygon tiles). Values follow ADOFAI-JS; the heptagon
 * entries use the exact exterior angle 360/7 instead of its rounded 52.
 * These are not verified against the game, so the parser reports when they are used.
 */
export const PATH_RELATIVE: Readonly<Record<string, number>> = {
  '5': 72,
  '6': -72,
  '7': 360 / 7,
  '8': -360 / 7,
  '9': -30,
  h: 120,
  j: -120,
  t: 60,
  y: 300,
};

export function pathDataToAngles(path: string, warnings?: string[]): number[] {
  const out: number[] = [];
  let prev = 0;
  let usedRelative = false;
  const unknown = new Set<string>();
  for (const ch of path) {
    if (ch === '!') {
      out.push(MIDSPIN);
      continue;
    }
    const abs = PATH_ABSOLUTE[ch];
    if (abs !== undefined) {
      out.push(abs);
      prev = abs;
      continue;
    }
    const rel = PATH_RELATIVE[ch];
    if (rel !== undefined) {
      usedRelative = true;
      prev = mod(prev + rel, 360);
      out.push(prev);
      continue;
    }
    if (ch.trim() === '') continue;
    unknown.add(ch);
    out.push(prev);
  }
  if (usedRelative) warnings?.push('다각형 타일 문자(5, 6, 7, 8 등)는 추정 각도로 처리했습니다.');
  if (unknown.size)
    warnings?.push(`알 수 없는 pathData 문자를 직진으로 처리했습니다: ${[...unknown].join(' ')}`);
  return out;
}
