import type { Hand, Lane } from './layout';
import { FULL_FINGERS, buildLanes, handLanes, otherHand } from './layout';
import { keysForLayout } from './keys';
import { formatOrder } from './order';
import type { Band, FingeringProfile, KeyCount, RollStyle, SpeedUnit, Tier } from './profile';
import { DEFAULT_CHORD, DEFAULT_JUDGE, DEFAULT_RUN, DEFAULT_TIERS, newProfileId } from './profile';

export interface NamedOrder {
  key: string;
  name: string;
  seq: number[];
}

const fingersOnly = (lanes: Lane[], hand: Hand) =>
  handLanes(lanes, hand)
    .filter((l) => l.finger !== 'thumb')
    .map((l) => l.index);

/**
 * The order the simple layout uses for a key count (0-based lanes).
 * 1 = main index, 2 = two-hand trill, 4/6/8 = that many fingers split over both hands,
 * rolled 안밖 (index outwards), 밖안 (outside inwards) or 계단 (main in→out, then other out→in).
 */
export function simpleOrder(keys: KeyCount, style: RollStyle, main: Hand, lanes: Lane[]): number[] {
  const mainF = fingersOnly(lanes, main);
  const offF = fingersOnly(lanes, otherHand(main));
  if (keys === 1) return mainF.slice(0, 1);
  if (keys === 2) return [mainF[0]!, offF[0]!].filter((x) => x !== undefined);
  const per = keys / 2;
  const m = mainF.slice(0, per);
  const o = offF.slice(0, per);
  if (style === 'outin') return [...m.reverse(), ...o.reverse()];
  if (style === 'stairs') return [...m, ...o.reverse()];
  return [...m, ...o];
}

export const KEY_COUNT_LABEL: Record<KeyCount, string> = {
  1: '1키',
  2: '2키 (양손 트릴)',
  4: '4키',
  6: '6키',
  8: '8키',
};

export const ROLL_STYLE_LABEL: Record<RollStyle, string> = {
  inout: '안밖',
  outin: '밖안',
  stairs: '계단 (3412형)',
};

/** Bands and speed unit actually used for assignment: generated in simple mode, hand-edited in custom mode. */
export function effectiveBands(profile: FingeringProfile): { bands: Band[]; speedUnit: SpeedUnit } {
  if (profile.mode === 'custom') return { bands: profile.bands, speedUnit: profile.speedUnit };
  const lanes = buildLanes(profile.fingers);
  return {
    speedUnit: 'beat',
    bands: profile.simple.tiers.map((t) => ({
      upTo: t.upTo,
      order: formatOrder(simpleOrder(t.keys, profile.simple.style, profile.mainHand, lanes)),
      anchor: null,
    })),
  };
}

/**
 * Orders the community names, generated for the current lanes and main hand.
 * 안밖 = each hand rolls from the index finger outwards (4키 5643, 6키 567432, 8키 56784321).
 */
export function namedOrders(lanes: Lane[], main: Hand): NamedOrder[] {
  const out: NamedOrder[] = [];
  const add = (key: string, name: string, seq: number[]) => {
    if (seq.length && !out.some((o) => formatOrder(o.seq) === formatOrder(seq))) out.push({ key, name, seq });
  };
  add('one', '주손 1키', simpleOrder(1, 'inout', main, lanes));
  add('trill', '양손 트릴 (2키)', simpleOrder(2, 'inout', main, lanes));
  for (const k of [4, 6, 8] as const) {
    add(`inout${k}`, `안밖 ${k}키`, simpleOrder(k, 'inout', main, lanes));
    add(`outin${k}`, `밖안 ${k}키`, simpleOrder(k, 'outin', main, lanes));
    add(`stairs${k}`, `계단 ${k}키`, simpleOrder(k, 'stairs', main, lanes));
  }
  add(
    'ascending',
    '왼쪽부터 차례로',
    lanes.map((l) => l.index),
  );
  add('descending', '오른쪽부터 차례로', lanes.map((l) => l.index).reverse());
  return out;
}

export interface ProfilePreset {
  key: string;
  name: string;
  description: string;
  style: RollStyle;
  tiers: Tier[];
}

/** Starting points; everything stays editable. */
export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    key: 'basic',
    name: '기본 (안밖)',
    description:
      '4비트 이하 1키, 8비트 양손 트릴, 16비트 4키, 24비트 6키, 32비트 이상 8키. 각 손은 검지부터 바깥으로 굴립니다.',
    style: 'inout',
    tiers: DEFAULT_TIERS,
  },
  {
    key: 'outin',
    name: '기본 (밖안)',
    description: '기본과 같은 키 수를 쓰고, 각 손은 바깥 손가락부터 검지 쪽으로 굴립니다.',
    style: 'outin',
    tiers: DEFAULT_TIERS,
  },
  {
    key: 'stairs',
    name: '기본 (계단 3412형)',
    description: '주손은 검지부터 바깥으로, 이어서 반대 손은 바깥부터 검지로 이어지는 계단 순서입니다.',
    style: 'stairs',
    tiers: DEFAULT_TIERS,
  },
  {
    key: 'max4',
    name: '4키까지만',
    description: '8비트까지는 기본과 같고, 그보다 빠른 연타는 전부 4키로 칩니다.',
    style: 'inout',
    tiers: [
      { upTo: 4, keys: 1 },
      { upTo: 8, keys: 2 },
      { upTo: null, keys: 4 },
    ],
  },
  {
    key: 'trill',
    name: '양손 트릴만',
    description: '느린 곳은 주손 1키, 그 외에는 전부 양손 검지로 번갈아 칩니다.',
    style: 'inout',
    tiers: [
      { upTo: 4, keys: 1 },
      { upTo: null, keys: 2 },
    ],
  },
];

export function profileFromPreset(preset: ProfilePreset, name?: string): FingeringProfile {
  const lanes = buildLanes(FULL_FINGERS);
  const profile: FingeringProfile = {
    id: newProfileId(),
    name: name ?? preset.name,
    version: 4,
    mode: 'simple',
    simple: { style: preset.style, tiers: preset.tiers.map((t) => ({ ...t })) },
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

export function defaultProfile(): FingeringProfile {
  return profileFromPreset(PROFILE_PRESETS[0]!);
}
