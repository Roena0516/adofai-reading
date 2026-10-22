import { remapKeys } from './keys';
import type { Finger, Hand, HandFingers } from './layout';
import { ALL_FINGERS, FULL_FINGERS, buildLanes, sameFingers } from './layout';
import { remapOrder } from './order';

/** How band thresholds are measured: effective stream BPM or "N비트" (4 × notes per beat). */
export type SpeedUnit = 'bpm' | 'beat';
export type ChordAssign = 'cycle' | 'otherHand' | 'sameHand';
/** How the fingers of each hand roll in the simple layout. 안밖: 검지→바깥, 밖안: 바깥→검지, 계단: 3412형. */
export type RollStyle = 'inout' | 'outin' | 'stairs';
export type KeyCount = 1 | 2 | 3 | 4 | 6 | 8;
/** Which key counts the simple layout uses: built around a two-hand trill (2) or four fingers (4). */
export type KeyBase = 2 | 4;

/** A speed range and the cyclic finger order used inside it. */
export interface Band {
  /** Upper bound (inclusive) in `speedUnit`; null = no limit. */
  upTo: number | null;
  /** Lane sequence like "5643". */
  order: string;
  /** 1-based lane that should land on the strongest beat of each run; null = first in order. */
  anchor: number | null;
}

/** One row of the simple layout: streams up to this many 비트 use this many keys. */
export interface Tier {
  upTo: number | null;
  keys: KeyCount;
}

export interface FingeringProfile {
  id: string;
  name: string;
  version: 5;
  /** 'simple': orders come from `simple` (기반별 키 수). 'custom': the hand-edited `bands`. */
  mode: 'simple' | 'custom';
  simple: {
    style: RollStyle;
    /** Key counts per 비트 come from `BASE_TIERS[base]`. */
    base: KeyBase;
  };
  fingers: HandFingers;
  mainHand: Hand;
  /** KeyboardEvent.code per lane, in lane order. */
  keys: string[];
  speedUnit: SpeedUnit;
  bands: Band[];
  run: {
    /** 'run': restart the cycle at every run. 'rest': keep the hands flowing until a rest. */
    reanchor: 'run' | 'rest';
    /** Rest length (beats) that restarts the cycle in 'rest' mode. */
    restBeats: number;
    /** 'metric': put the anchor lane on the strongest beat. 'first': on the first note. */
    anchor: 'metric' | 'first';
    /** A run never starts on the finger that just played if the gap is shorter than this (ms). 0 = off. */
    sameFingerMinMs: number;
  };
  chord: {
    thresholdMs: number;
    maxSize: number;
    /** cycle: chord takes the next lanes of the order. otherHand: mirror finger. sameHand: next finger out. */
    assign: ChordAssign;
    /** Sharp turns up to this angle are one-hand doubles (30°, 15° 동타). 0 disables. */
    oneHandAngle: number;
    /** Longest gap (ms) still treated as a one-hand double. */
    oneHandMaxMs: number;
    /** Which way the second finger of a one-hand double goes: 'out' 검→중, 'in' 중→검. */
    oneHandDirection: 'out' | 'in';
    /** A 90° pair inside a stream (half the stream's gap) is played by one hand, shown at its real times. */
    streamDouble: boolean;
    /** …only in streams at least this dense (비트). */
    streamDoubleMinBeat: number;
  };
  judge: {
    /** Whether pressing the wrong finger in time counts as a miss for accuracy. */
    wrongFingerIsMiss: boolean;
  };
}

/**
 * Keys per stream density.
 * 2키 기반: 8비트 one finger, 12·16비트 two-hand trill, 24비트 3키, 32비트 4키.
 * 4키 기반: 8비트 trill, 12비트 3키 (every beat starts on the same finger), 16비트 4키, 24비트 6키, 32비트 8키.
 */
export const BASE_TIERS: Record<KeyBase, Tier[]> = {
  2: [
    { upTo: 8, keys: 1 },
    { upTo: 16, keys: 2 },
    { upTo: 24, keys: 3 },
    { upTo: null, keys: 4 },
  ],
  4: [
    { upTo: 4, keys: 1 },
    { upTo: 8, keys: 2 },
    { upTo: 12, keys: 3 },
    { upTo: 16, keys: 4 },
    { upTo: 24, keys: 6 },
    { upTo: null, keys: 8 },
  ],
};

export const DEFAULT_RUN: FingeringProfile['run'] = {
  reanchor: 'rest',
  restBeats: 0.5,
  anchor: 'metric',
  sameFingerMinMs: 150,
};
export const DEFAULT_CHORD: FingeringProfile['chord'] = {
  thresholdMs: 40,
  maxSize: 4,
  assign: 'cycle',
  oneHandAngle: 30,
  oneHandMaxMs: 100,
  oneHandDirection: 'out',
  streamDouble: true,
  streamDoubleMinBeat: 16,
};
/** Timing windows follow the game (practice/judge.ts); the profile only keeps what counts as a miss. */
export const DEFAULT_JUDGE: FingeringProfile['judge'] = {
  wrongFingerIsMiss: false,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  opts.includes(v as T) ? (v as T) : d;

function fingerList(v: unknown): Finger[] {
  return Array.isArray(v) ? (v.filter((f) => ALL_FINGERS.includes(f as Finger)) as Finger[]) : [];
}

export function sortBands(bands: Band[]): Band[] {
  return [...bands].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
}

let idCounter = 0;
export function newProfileId(): string {
  idCounter++;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** The base an older profile's per-비트 key counts were closest to: a 2-key trill at 16비트 means 2키 기반. */
function baseFromTiers(v: unknown): KeyBase {
  if (!Array.isArray(v)) return 4;
  const tiers = v
    .filter(isObj)
    .map((t) => ({ upTo: typeof t.upTo === 'number' ? t.upTo : Infinity, keys: t.keys }))
    .sort((a, b) => a.upTo - b.upTo);
  const at16 = tiers.find((t) => t.upTo >= 16);
  return at16?.keys === 2 ? 2 : 4;
}

/**
 * Fill defaults and drop invalid fields so imported or old profiles are always usable.
 * Every profile shows the full 8 lanes; older profiles with fewer fingers get their orders and
 * keys moved to the matching fingers, and (being from before the simple layout) start in it.
 */
export function normalizeProfile(input: unknown): FingeringProfile {
  const o = isObj(input) ? input : {};
  const f = isObj(o.fingers) ? o.fingers : {};
  const oldFingers: HandFingers = { L: fingerList(f.L), R: fingerList(f.R) };
  const migrate = oldFingers.L.length + oldFingers.R.length > 0 && !sameFingers(oldFingers, FULL_FINGERS);
  const oldLanes = buildLanes(oldFingers);
  const lanes = buildLanes(FULL_FINGERS);

  const rawBands = Array.isArray(o.bands) ? o.bands : [];
  let bands: Band[] = rawBands.filter(isObj).map((b) => ({
    upTo: typeof b.upTo === 'number' && Number.isFinite(b.upTo) ? b.upTo : null,
    order: typeof b.order === 'string' ? b.order : '',
    anchor: typeof b.anchor === 'number' && Number.isFinite(b.anchor) ? b.anchor : null,
  }));
  let keys = Array.isArray(o.keys) ? o.keys.map((k) => (typeof k === 'string' ? k : '')) : [];
  if (migrate) {
    bands = bands.map((b) => {
      const order = remapOrder(b.order, oldLanes, lanes);
      let anchor = b.anchor;
      if (anchor != null && oldLanes[anchor - 1]) {
        const src = oldLanes[anchor - 1]!;
        const j = lanes.findIndex((l) => l.hand === src.hand && l.finger === src.finger);
        anchor = j >= 0 ? j + 1 : null;
      }
      return { ...b, order, anchor };
    });
    keys = remapKeys(oldLanes, keys, lanes);
  } else if (keys.length < lanes.length) {
    keys = remapKeys(lanes.slice(0, keys.length), keys, lanes);
  }

  const simple = isObj(o.simple) ? o.simple : {};
  const run = isObj(o.run) ? o.run : {};
  const chord = isObj(o.chord) ? o.chord : {};
  const judge = isObj(o.judge) ? o.judge : {};
  const version = typeof o.version === 'number' ? o.version : 1;
  const isV2 = version >= 2;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newProfileId(),
    name: typeof o.name === 'string' && o.name.trim() ? o.name : '내 타법',
    version: 5,
    // v5: the hand-edited orders are no longer offered in the app, so older profiles use the layout
    mode: version >= 5 ? oneOf(o.mode, ['simple', 'custom'] as const, 'simple') : 'simple',
    simple: {
      style: oneOf(simple.style, ['inout', 'outin', 'stairs'] as const, 'inout'),
      // v5: per-비트 key counts became a 2키/4키 base
      base: simple.base === 2 || simple.base === 4 ? simple.base : baseFromTiers(simple.tiers),
    },
    fingers: { L: [...FULL_FINGERS.L], R: [...FULL_FINGERS.R] },
    mainHand: oneOf(o.mainHand, ['L', 'R'] as const, 'R'),
    keys,
    speedUnit: oneOf(o.speedUnit, ['bpm', 'beat'] as const, 'bpm'),
    bands: bands.length ? sortBands(bands) : [{ upTo: null, order: '5', anchor: null }],
    run: {
      // profiles from before v2 used 'run' as the default; move them to the new flowing default
      reanchor: isV2
        ? oneOf(run.reanchor, ['run', 'rest'] as const, DEFAULT_RUN.reanchor)
        : DEFAULT_RUN.reanchor,
      restBeats: Math.max(0, numOr(run.restBeats, DEFAULT_RUN.restBeats)),
      // v4: a stream starts so the first finger lands on its strong beat again (v3 started every
      // stream on its first note, which put off-beat trills on the right hand)
      anchor:
        version >= 4
          ? oneOf(run.anchor, ['metric', 'first'] as const, DEFAULT_RUN.anchor)
          : DEFAULT_RUN.anchor,
      sameFingerMinMs: Math.max(0, numOr(run.sameFingerMinMs, DEFAULT_RUN.sameFingerMinMs)),
    },
    chord: {
      thresholdMs: Math.max(0, numOr(chord.thresholdMs, DEFAULT_CHORD.thresholdMs)),
      maxSize: Math.max(2, Math.round(numOr(chord.maxSize, DEFAULT_CHORD.maxSize))),
      assign: oneOf(chord.assign, ['cycle', 'otherHand', 'sameHand'] as const, DEFAULT_CHORD.assign),
      oneHandAngle: Math.max(0, Math.min(180, numOr(chord.oneHandAngle, DEFAULT_CHORD.oneHandAngle))),
      oneHandMaxMs: Math.max(0, numOr(chord.oneHandMaxMs, DEFAULT_CHORD.oneHandMaxMs)),
      oneHandDirection: oneOf(chord.oneHandDirection, ['out', 'in'] as const, DEFAULT_CHORD.oneHandDirection),
      streamDouble: typeof chord.streamDouble === 'boolean' ? chord.streamDouble : DEFAULT_CHORD.streamDouble,
      streamDoubleMinBeat: Math.max(0, numOr(chord.streamDoubleMinBeat, DEFAULT_CHORD.streamDoubleMinBeat)),
    },
    judge: {
      wrongFingerIsMiss: typeof judge.wrongFingerIsMiss === 'boolean' ? judge.wrongFingerIsMiss : false,
    },
  };
}
