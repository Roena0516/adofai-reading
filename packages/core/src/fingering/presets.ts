import type { Hand, Lane } from './layout';
import { FULL_FINGERS, buildLanes, handLanes, otherHand } from './layout';
import { keysForLayout } from './keys';
import { formatOrder } from './order';
import type { Band, FingeringProfile, KeyBase, KeyCount, RollStyle, SpeedUnit } from './profile';
import { BASE_TIERS, DEFAULT_CHORD, DEFAULT_JUDGE, DEFAULT_RUN, newProfileId } from './profile';

const fingersOnly = (lanes: Lane[], hand: Hand) =>
  handLanes(lanes, hand)
    .filter((l) => l.finger !== 'thumb')
    .map((l) => l.index);

/**
 * The order the simple layout uses for a key count (0-based lanes). The main hand takes the larger
 * half: 1 = main index, 2 = two-hand trill, 3 = main index+middle and the other index (564),
 * 4/6/8 = split evenly. Each hand rolls 안밖 (index outwards), 밖안 (outside inwards) or
 * 계단 (main in→out, then the other hand out→in).
 */
export function simpleOrder(keys: KeyCount, style: RollStyle, main: Hand, lanes: Lane[]): number[] {
  const mainN = Math.ceil(keys / 2);
  const m = fingersOnly(lanes, main).slice(0, mainN);
  const o = fingersOnly(lanes, otherHand(main)).slice(0, keys - mainN);
  if (style === 'outin') return [...m.reverse(), ...o.reverse()];
  if (style === 'stairs') return [...m, ...o.reverse()];
  return [...m, ...o];
}

export const KEY_COUNT_LABEL: Record<KeyCount, string> = {
  1: '1키',
  2: '2키 (양손 트릴)',
  3: '3키',
  4: '4키',
  6: '6키',
  8: '8키',
};

export const BASE_LABEL: Record<KeyBase, string> = {
  2: '2키 기반',
  4: '4키 기반',
};

export const ROLL_STYLE_LABEL: Record<RollStyle, string> = {
  inout: '안밖',
  outin: '밖안',
  stairs: '계단 (3412형)',
};

/**
 * Bands and speed unit actually used for assignment: generated from a base in simple mode
 * (the profile's own base unless a level switches it), hand-edited in custom mode.
 */
export function effectiveBands(
  profile: FingeringProfile,
  base: KeyBase = profile.simple.base,
): { bands: Band[]; speedUnit: SpeedUnit } {
  if (profile.mode === 'custom') return { bands: profile.bands, speedUnit: profile.speedUnit };
  const lanes = buildLanes(profile.fingers);
  return {
    speedUnit: 'beat',
    bands: BASE_TIERS[base].map((t) => ({
      upTo: t.upTo,
      order: formatOrder(simpleOrder(t.keys, profile.simple.style, profile.mainHand, lanes)),
      anchor: null,
    })),
  };
}

/** A fresh profile: all eight fingers, 안밖 by default, on a 2키 or 4키 base. */
export function defaultProfile(base: KeyBase = 4, style: RollStyle = 'inout'): FingeringProfile {
  const lanes = buildLanes(FULL_FINGERS);
  const profile: FingeringProfile = {
    id: newProfileId(),
    name: '내 타법',
    version: 5,
    mode: 'simple',
    simple: { style, base },
    fingers: { L: [...FULL_FINGERS.L], R: [...FULL_FINGERS.R] },
    mainHand: 'R',
    keys: keysForLayout(lanes),
    speedUnit: 'beat',
    bands: [],
    run: { ...DEFAULT_RUN },
    chord: { ...DEFAULT_CHORD },
    judge: { ...DEFAULT_JUDGE },
  };
  profile.bands = effectiveBands(profile).bands;
  return profile;
}
