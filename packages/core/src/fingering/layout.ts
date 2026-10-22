export type Hand = 'L' | 'R';
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface HandFingers {
  L: Finger[];
  R: Finger[];
}

/** One key column. Lanes are numbered left to right like the community's "1234" notation. */
export interface Lane {
  index: number;
  hand: Hand;
  finger: Finger;
}

export const ALL_FINGERS: Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
/** The standard 8-lane layout: 1 L소 2 L약 3 L중 4 L검 | 5 R검 6 R중 7 R약 8 R소. */
export const FULL_FINGERS: HandFingers = {
  L: ['pinky', 'ring', 'middle', 'index'],
  R: ['index', 'middle', 'ring', 'pinky'],
};

export function sameFingers(a: HandFingers, b: HandFingers): boolean {
  const key = (f: HandFingers) =>
    `${[...new Set(f.L)].sort().join(',')}|${[...new Set(f.R)].sort().join(',')}`;
  return key(a) === key(b);
}
/** 0 = innermost (thumb) … 4 = outermost (pinky). */
export const FINGER_RANK: Record<Finger, number> = { thumb: 0, index: 1, middle: 2, ring: 3, pinky: 4 };
export const FINGER_SHORT: Record<Finger, string> = {
  thumb: '엄',
  index: '검',
  middle: '중',
  ring: '약',
  pinky: '소',
};
export const FINGER_NAME: Record<Finger, string> = {
  thumb: '엄지',
  index: '검지',
  middle: '중지',
  ring: '약지',
  pinky: '소지',
};
export const HAND_NAME: Record<Hand, string> = { L: '왼손', R: '오른손' };

export function otherHand(h: Hand): Hand {
  return h === 'L' ? 'R' : 'L';
}

/** Keyboard order: left pinky … left thumb, right thumb … right pinky. */
export function buildLanes(fingers: HandFingers): Lane[] {
  const byRank = (a: Finger, b: Finger) => FINGER_RANK[a] - FINGER_RANK[b];
  const left = [...new Set(fingers.L)].sort(byRank).reverse();
  const right = [...new Set(fingers.R)].sort(byRank);
  const lanes: Lane[] = [];
  for (const finger of left) lanes.push({ index: lanes.length, hand: 'L', finger });
  for (const finger of right) lanes.push({ index: lanes.length, hand: 'R', finger });
  return lanes;
}

/** Lanes of one hand from the innermost finger outwards. */
export function handLanes(lanes: Lane[], hand: Hand): Lane[] {
  return lanes.filter((l) => l.hand === hand).sort((a, b) => FINGER_RANK[a.finger] - FINGER_RANK[b.finger]);
}

export function laneLabel(lane: Lane): string {
  return `${lane.hand}${FINGER_SHORT[lane.finger]}`;
}

/** The lane slow notes default to: the innermost non-thumb finger of the main hand. */
export function homeLane(lanes: Lane[], main: Hand): number {
  const own = handLanes(lanes, main);
  const pick = own.find((l) => l.finger !== 'thumb') ?? own[0] ?? handLanes(lanes, otherHand(main))[0];
  return pick?.index ?? 0;
}
