import { describe, expect, it } from 'vitest';
import {
  FULL_FINGERS,
  analyzeRhythm,
  assignFingering,
  buildLanes,
  computeTiming,
  defaultProfile,
  describeOrder,
  effectiveBands,
  formatOrder,
  laneLabel,
  normalizeProfile,
  parseLevel,
  parseOrder,
  remapOrder,
  simpleOrder,
} from '../src';
import type { Band, FingeringProfile, Timing } from '../src';

function fakeTiming(noteTimes: number[], bpm = 120): Timing {
  return {
    tiles: [],
    notes: noteTimes.map((time, i) => ({ id: i, floor: i + 1, time, bpm, endTime: null, autoplay: false })),
    noteTimes: Float64Array.from(noteTimes),
    warnings: [],
    endTime: noteTimes.at(-1)!,
  };
}
const SEC = [{ startFloor: 0, startTime: 0, bpm: 120 }];
const beats = (xs: number[]) => xs.map((b) => b / 2);
const LANES = buildLanes(FULL_FINGERS);

function custom(bands: Band[], speedUnit: 'bpm' | 'beat' = 'bpm'): FingeringProfile {
  return { ...defaultProfile(), mode: 'custom', bands, speedUnit };
}
const band = (order: string, upTo: number | null = null, anchor: number | null = null): Band => ({
  upTo,
  order,
  anchor,
});

function lanesFor(profile: FingeringProfile, noteBeats: number[]): string {
  const timing = fakeTiming(beats(noteBeats));
  const a = analyzeRhythm(timing, SEC, { chordThresholdMs: profile.chord.thresholdMs });
  const r = assignFingering(
    a,
    timing.notes.map((n) => n.floor),
    profile,
  );
  return formatOrder([...r.noteLane]);
}

describe('8 lanes and orders', () => {
  it('always lays out L소 … R소 numbered 1–8', () => {
    expect(LANES.map(laneLabel).join(' ')).toBe('L소 L약 L중 L검 R검 R중 R약 R소');
    expect(describeOrder(parseOrder('5643', 8).seq, LANES)).toBe('R검 → R중 → L검 → L중');
  });

  it('remaps an order from an older lane layout by finger', () => {
    const old = buildLanes({ L: ['middle', 'index'], R: ['index', 'middle'] });
    expect(remapOrder('3421', old, LANES)).toBe('5643');
  });

  it('builds the simple orders for each key count and roll style', () => {
    const o = (k: 1 | 2 | 3 | 4 | 6 | 8, s: 'inout' | 'outin' | 'stairs', m: 'L' | 'R' = 'R') =>
      formatOrder(simpleOrder(k, s, m, LANES));
    expect(o(1, 'inout')).toBe('5');
    expect(o(2, 'inout')).toBe('54');
    expect(o(3, 'inout')).toBe('564');
    expect(o(3, 'outin')).toBe('654');
    expect(o(4, 'inout')).toBe('5643');
    expect(o(6, 'inout')).toBe('567432');
    expect(o(8, 'inout')).toBe('56784321');
    expect(o(4, 'outin')).toBe('6534');
    expect(o(8, 'outin')).toBe('87651234');
    expect(o(4, 'stairs')).toBe('5634');
    expect(o(8, 'stairs')).toBe('56781234');
    expect(o(4, 'inout', 'L')).toBe('4356');
  });
});

describe('simple layout (2키/4키 기반)', () => {
  const p = defaultProfile();

  it('uses 1 key for quarters, a two-hand trill for 8ths and 4 keys for 16ths', () => {
    expect(lanesFor(p, [0, 1, 2, 3])).toBe('5555');
    expect(lanesFor(p, [0, 0.5, 1, 1.5])).toBe('5454');
    expect(lanesFor(p, [0, 0.25, 0.5, 0.75, 1])).toBe('56435');
  });

  it('uses 6 keys for 24ths and 8 keys for 32nds', () => {
    expect(lanesFor(p, [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6])).toBe('567432');
    expect(lanesFor(p, [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875])).toBe('56784321');
  });

  it('uses 3 keys for 12비트 triplets on the 4키 base, a trill on the 2키 base', () => {
    const triplets = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3];
    expect(lanesFor(p, triplets)).toBe('564564');
    expect(lanesFor(defaultProfile(2), triplets)).toBe('545454');
  });

  it('uses 3 keys for 24비트, 6 for 48비트 and 8 from 64비트 on the 2키 base', () => {
    const p2 = defaultProfile(2);
    expect(lanesFor(p2, [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6])).toBe('564564');
    expect(lanesFor(p2, [0, 0.125, 0.25, 0.375, 0.5])).toBe('56435');
    expect(
      lanesFor(
        p2,
        Array.from({ length: 7 }, (_, i) => i / 12),
      ),
    ).toBe('5674325');
    expect(
      lanesFor(
        p2,
        Array.from({ length: 9 }, (_, i) => i / 16),
      ),
    ).toBe('567843215');
  });

  it('exposes the generated bands for each base', () => {
    const show = (q: ReturnType<typeof defaultProfile>) =>
      effectiveBands(q).bands.map((b) => `${b.upTo ?? '∞'}:${b.order}`);
    expect(show(p)).toEqual(['4:5', '8:54', '12:564', '16:5643', '24:567432', '∞:56784321']);
    expect(show(defaultProfile(2))).toEqual(['8:5', '16:54', '24:564', '32:5643', '48:567432', '∞:56784321']);
  });

  it('plays the off-beats a 16th step puts into a one-key 8th run with the other hand (MEGAMIX #533)', () => {
    // 8ths with 90° tiles: 1.25 and 1.75 sit between the 8ths, then a 270° tile brings the grid back
    const megamix = [0, 0.5, 1, 1.25, 1.75, 2.5, 3, 3.5, 4, 4.25, 4.75, 5.5];
    const p2 = defaultProfile(2);
    expect(lanesFor(p2, megamix)).toBe('555' + '44' + '555' + '5' + '44' + '5');
    const off = { ...p2, simple: { ...p2.simple, offbeatOtherHand: false } };
    expect(lanesFor(off, megamix)).toBe('555' + '45' + '555' + '5' + '45' + '5');
    // off-beats reached only by dotted steps (Feral's 135° tiles) keep the one key
    expect(lanesFor(p2, [0, 1, 2, 3, 3.75, 4.5, 5.25, 6])).toBe('55555555');
  });

  it('switches the base from a floor on ("이 구간부터 2키 기반")', () => {
    // two 16th streams with a rest between them: notes 1-4 and 5-8 (floors 1-8)
    const beatsAt = [0, 0.25, 0.5, 0.75, 2, 2.25, 2.5, 2.75];
    const timing = fakeTiming(beats(beatsAt));
    const a = analyzeRhythm(timing, SEC);
    const floors = timing.notes.map((n) => n.floor);
    const run = (bases: { floor: number; base: 2 | 4 }[]) =>
      formatOrder([...assignFingering(a, floors, defaultProfile(4), { bases }).noteLane]);
    expect(run([])).toBe('5643' + '5643');
    expect(run([{ floor: floors[4]!, base: 2 }])).toBe('5643' + '5454');
    const r = assignFingering(a, floors, defaultProfile(4), { bases: [{ floor: floors[4]!, base: 2 }] });
    expect([...r.runBase]).toEqual([4, 2]);
  });
});

describe('assignFingering (custom bands)', () => {
  it('puts the first finger on the strong beat by default, or on the first note if asked', () => {
    const p = custom([band('5643')]);
    expect(lanesFor(p, [0.25, 0.5, 0.75, 1, 1.25])).toBe('64356');
    p.run.anchor = 'first';
    expect(lanesFor(p, [0.25, 0.5, 0.75, 1, 1.25])).toBe('56435');
  });

  it('starts an off-beat 8th trill with the left hand (약박은 왼손)', () => {
    const p = custom([band('54')]);
    expect(lanesFor(p, [0.5, 1, 1.5, 2, 2.5])).toBe('45454');
  });

  it('keeps a trill on the beat after a short 16th figure that leads into it', () => {
    // 8th trill · 16ths (5 6 4, rest) · 8th trill again: the beats stay on 5
    const p = defaultProfile();
    const notes = [0, 0.5, 1, 1.5, 2, 2.25, 2.5, 3, 3.5, 4, 4.5, 5];
    expect(lanesFor(p, notes)).toBe('5454' + '564' + '54545');
  });

  it('respects an explicit anchor lane', () => {
    expect(lanesFor(custom([band('5634', null, 3)]), [0, 0.25, 0.5, 0.75])).toBe('3456');
  });

  it('picks bands by effective BPM', () => {
    const p = custom([band('5', 150), band('54', 300), band('5643')]);
    // after the trill's 4 the 16ths take the beat on 5, and the hands still alternate
    expect(lanesFor(p, [0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.25, 5.5, 5.75])).toBe('55554545643');
    p.run.reanchor = 'run';
    expect(lanesFor(p, [0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.25, 5.5, 5.75])).toBe('55554545643');
  });

  it('gives a pseudo chord two different fingers', () => {
    const p = custom([band('5')]);
    p.chord.assign = 'otherHand';
    const timing = fakeTiming([0, 0.004, 1, 2]);
    const r = assignFingering(analyzeRhythm(timing, SEC), [1, 2, 3, 4], p);
    expect(formatOrder([...r.noteLane])).toBe('5455');
  });

  it('continues the cycle across short rests in rest mode, counting the rest as a slot', () => {
    const p = custom([band('5643')]);
    p.run.reanchor = 'rest';
    // 5 6 4 (rest = 3's turn) 5 6
    expect(lanesFor(p, [0, 0.25, 0.5, 1.0, 1.25])).toBe('56456');
    // 5 6 4 3 (rest = 5's turn) 6 4
    expect(lanesFor(p, [0, 0.25, 0.5, 0.75, 1.25, 1.5])).toBe('564364');
    p.run.reanchor = 'run';
    // each run starts fresh: the 8th at 1.5 is the strong beat of the second run
    expect(lanesFor(p, [0, 0.25, 0.5, 0.75, 1.25, 1.5])).toBe('564335');
  });

  it('does not start a fast run on the finger that just played', () => {
    const p = custom([band('5643')]);
    p.run.reanchor = 'run';
    const noteBeats = [0.75, 1, 1.125, 1.25, 1.375, 1.5];
    expect(lanesFor(p, noteBeats)).toBe('564356');
    p.run.sameFingerMinMs = 0;
    expect(lanesFor(p, noteBeats)).toBe('556435');
  });

  it('applies range and note overrides on top', () => {
    const timing = fakeTiming(beats([0, 1, 2, 3, 4, 5]));
    const r = assignFingering(analyzeRhythm(timing, SEC), [1, 2, 3, 4, 5, 6], defaultProfile(), {
      ranges: [{ id: 'a', fromFloor: 2, toFloor: 4, sequence: '12', enabled: true }],
      notes: { '6': 3 },
    });
    expect(formatOrder([...r.noteLane])).toBe('512154');
    expect([...r.noteSource]).toEqual([0, 1, 1, 1, 0, 2]);
  });

  it('reports invalid orders instead of crashing', () => {
    const r = assignFingering(analyzeRhythm(fakeTiming([0, 0.5]), SEC), [1, 2], custom([band('9')]));
    expect(r.errors.length).toBe(1);
    expect([...r.noteLane]).toEqual([4, 4]);
  });
});

describe('one-hand doubles', () => {
  // floor 2 turns only 30° (83 ms at 120 BPM): a 30° 동타.
  const sharp = parseLevel(
    JSON.stringify({ angleData: [0, 0, 150, 150, 150, 150], settings: { bpm: 120, offset: 0 }, actions: [] }),
  );
  const sharpTiming = computeTiming(sharp);
  const sharpFloors = sharpTiming.notes.map((n) => n.floor);
  const lanesOf = (p: FingeringProfile, timing: Timing, floors: number[], sections = SEC) =>
    formatOrder([...assignFingering(analyzeRhythm(timing, sections), floors, p).noteLane]);

  it('keeps a 30° 동타 on one hand and hands the next note to the other hand', () => {
    const a = analyzeRhythm(sharpTiming, SEC);
    expect(a.events.find((e) => e.noteCount > 1)).toMatchObject({
      firstNote: 1,
      oneHand: true,
      spread: false,
    });
    expect(lanesOf(custom([band('54')]), sharpTiming, sharpFloors).slice(0, 4)).toBe('5435');
  });

  it('follows the direction setting for the second finger', () => {
    const p = custom([band('6')]);
    expect(lanesOf(p, sharpTiming, sharpFloors).slice(1, 3)).toBe('67');
    p.chord.oneHandDirection = 'in';
    expect(lanesOf(p, sharpTiming, sharpFloors).slice(1, 3)).toBe('65');
  });

  // 16ths at 120 BPM base (480 BPM tiles) with one 90° tile: the pair is half the stream's gap.
  const stream = parseLevel(
    JSON.stringify({ pathData: 'RRRRRUUUUU', settings: { bpm: 480, offset: 0 }, actions: [] }),
  );
  const streamTiming = computeTiming(stream);
  const streamFloors = streamTiming.notes.map((n) => n.floor);

  it('treats a 90° pair inside a 16비트 stream as a spread one-hand double', () => {
    const a = analyzeRhythm(streamTiming, SEC);
    const pair = a.events.find((e) => e.noteCount === 2)!;
    expect(pair).toMatchObject({ oneHand: true, spread: true });
    expect(streamTiming.notes[pair.firstNote]!.floor).toBe(5);
    // the stream stays one run through the double
    expect(a.runs.filter((r) => r.eventCount >= 3).length).toBe(1);
  });

  it('plays the pair like a 동타: two fingers of one hand, that hand rolls on outwards', () => {
    const a = analyzeRhythm(streamTiming, SEC);
    // 5 6 4 3 | (5+6) 7 4 3 …
    expect(lanesOf(defaultProfile(), streamTiming, streamFloors).slice(0, 9)).toBe('564356743');
    expect(a.events.find((e) => e.noteCount === 2)!.spread).toBe(true);
  });

  it('can be switched off', () => {
    const a = analyzeRhythm(streamTiming, SEC, { streamDoubleMinBeat: 0 });
    expect(a.events.every((e) => e.noteCount === 1)).toBe(true);
  });
});

describe('normalizeProfile', () => {
  it('moves older profiles to the 8-lane layout and the simple mode', () => {
    const p = normalizeProfile({
      name: 'old',
      fingers: { L: ['middle', 'index'], R: ['index', 'middle'] },
      bands: [
        { upTo: null, order: '3421' },
        { upTo: 300, order: '3' },
      ],
      keys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    });
    expect(p.version).toBe(5);
    expect(p.run.anchor).toBe('metric');
    expect(p.simple.base).toBe(4);
    expect(p.mode).toBe('simple');
    expect(p.fingers).toEqual(FULL_FINGERS);
    expect(p.bands.map((b) => b.order)).toEqual(['5', '5643']);
    expect(p.keys).toEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']);
  });

  it('turns per-비트 key counts into a base, and the hand-edited mode into the layout', () => {
    const twoKey = normalizeProfile({
      version: 4,
      mode: 'custom',
      simple: {
        style: 'outin',
        tiers: [
          { upTo: 8, keys: 1 },
          { upTo: 16, keys: 2 },
          { upTo: null, keys: 4 },
        ],
      },
    });
    expect(twoKey.simple).toEqual({ style: 'outin', base: 2, offbeatOtherHand: true });
    expect(twoKey.mode).toBe('simple');
    expect(normalizeProfile({ version: 4, simple: { tiers: [{ upTo: 16, keys: 4 }] } }).simple.base).toBe(4);
  });

  it('keeps a current custom profile as it is', () => {
    const p = normalizeProfile({
      ...defaultProfile(),
      mode: 'custom',
      bands: [{ upTo: null, order: '5634', anchor: null }],
    });
    expect(p.mode).toBe('custom');
    expect(p.bands[0]!.order).toBe('5634');
  });
});

describe('90° doubles in a straight 질주', () => {
  // R R R R U R R R: the 90° turn is followed by a 270° one (half a gap, then one and a half).
  const lv = parseLevel(
    JSON.stringify({ pathData: 'RRRRRURRRR', settings: { bpm: 480, offset: 0 }, actions: [] }),
  );
  const timing = computeTiming(lv);

  it('finds the pair and keeps the stream in one run', () => {
    const a = analyzeRhythm(timing, SEC);
    const pair = a.events.find((e) => e.noteCount === 2)!;
    expect(pair).toMatchObject({ oneHand: true, spread: true });
    expect(a.runs.filter((r) => r.eventCount >= 3).length).toBe(1);
  });
});

describe('동타 inside hand groups', () => {
  // 120 BPM base, 480 BPM tiles: 180° = one 16th. Build angleData from clockwise rotations.
  const anglesFrom = (rots: number[]) => {
    const a = [0];
    for (const r of rots) a.push((((a.at(-1)! + 180 - r) % 360) + 360) % 360);
    return a;
  };
  const lanesFrom = (rots: number[], bpm = 480, base = 120, profile = defaultProfile()) => {
    const lv = parseLevel(
      JSON.stringify({ angleData: anglesFrom(rots), settings: { bpm, offset: 0 }, actions: [] }),
    );
    const t = computeTiming(lv);
    const a = analyzeRhythm(t, [{ startFloor: 0, startTime: 0, bpm: base }]);
    return formatOrder([
      ...assignFingering(
        a,
        t.notes.map((n) => n.floor),
        profile,
      ).noteLane,
    ]);
  };
  // a 30° 동타 on a beat: 30° + 150° fill one 16th, then three more 16ths
  const beatWithChord = [30, 150, 180, 180, 180];
  const plainBeat = [180, 180, 180, 180];

  it('a 동타 on the right-hand beat makes that hand roll 5+6 then 7, then 4 3', () => {
    expect(lanesFrom([...beatWithChord, ...beatWithChord, 180])).toBe('56743' + '56743' + '56');
  });

  it('alternates 567 43 56 43 when the 동타 comes every other beat', () => {
    expect(lanesFrom([...beatWithChord, ...plainBeat, ...beatWithChord, 180])).toBe(
      '56743' + '5643' + '56743' + '56',
    );
  });

  it('puts an off-beat 동타 that opens a stream on the left hand, the beat on 5', () => {
    // a lone note, then the stream starts half a beat later with a 동타: 4+3 2 | 5 6 4 3
    expect(lanesFrom([360, ...beatWithChord, ...plainBeat]).slice(0, 10)).toBe('5' + '432' + '5643' + '56');
  });

  // 동타 then a 16th rest = one hand's turn: 5+6 (rest) 4 3 5+6 (rest) 4 3 …
  const chordRest = [30, 330];
  const twoSixteenths = [180, 180];

  it('counts the rest after a 동타 as part of that hand turn (5-6 4 3 5-6 4 3)', () => {
    const pattern = [...chordRest, ...twoSixteenths];
    expect(lanesFrom([...pattern, ...pattern, ...pattern, 30])).toBe(
      '56' + '43' + '56' + '43' + '56' + '43' + '56',
    );
  });

  it('keeps repeated 동타 on the main-hand index and middle after a rest (Flower Rocket #1626)', () => {
    // at 240 BPM 16ths: 5 6 4 (rest) · 4 5+6 (rest) · 4 3 5+6 (rest) · 4 3 5+6 (rest) · 4 3 5+6 — the left
    // index plays twice 2 sixteenths apart rather than the 동타 moving to the left hand; the 8비트 trill
    // (5 4) does not borrow a middle finger
    const figure = [...twoSixteenths, ...chordRest];
    const rots = [180, 180, 360, 360, ...chordRest, ...figure, ...figure, ...twoSixteenths, 30];
    expect(lanesFrom(rots, 960, 240)).toBe('564' + '4' + '56' + '43' + '56' + '43' + '56' + '43' + '56');
  });

  it('plays a repeated figure the same way every time with 2 keys (다가닥 다가닥)', () => {
    // 8비트 with one key, 16비트 with two (5 4): Flower Rocket #722-746 at 240 BPM 16ths.
    const p = defaultProfile();
    p.simple = { ...p.simple, base: 2 };
    const figure = [...twoSixteenths, ...chordRest]; // 단타 단타 동타 · 쉼
    const rots = [...chordRest, ...chordRest, ...figure, ...figure, ...figure, 180];
    // 5+6 5+6 | 5 4 5+6 | 5 4 5+6 | 5 4 5+6 — not 5 4 5+6 | 4 5 4+3 | …
    expect(lanesFrom(rots, 960, 240, p)).toBe('56' + '56' + '5456' + '5456' + '5456' + '54');
  });

  it('plays a 32nd note inserted into a 16th stream with the same hand (Flower Rocket #1720)', () => {
    const p = defaultProfile();
    p.simple = { ...p.simple, base: 2 };
    // per beat: 16th, 16th, then 90° + 90° (one extra 32nd), back on the 16th grid
    const beat = [180, 180, 90, 90, 180];
    const rots = [...beat, ...beat, ...beat, ...beat, 180];
    const lv = parseLevel(
      JSON.stringify({ angleData: anglesFrom(rots), settings: { bpm: 960, offset: 0 }, actions: [] }),
    );
    const a = analyzeRhythm(computeTiming(lv), [{ startFloor: 0, startTime: 0, bpm: 240 }]);
    // one 16비트 stream, the extra note paired with the 16th before it
    expect(a.runs.filter((r) => r.eventCount > 1)).toHaveLength(1);
    expect(a.events.filter((e) => e.spread)).toHaveLength(4);
    // 5 4 5+6 4 every beat: right hand on the beat and the pair, left hand in between
    expect(lanesFrom(rots, 960, 240, p)).toBe('54564'.repeat(4) + '54');
  });

  it('밖안: a 동타 followed by the same hand takes the outer finger first (7+6 5 · 2+3 4)', () => {
    const outin = defaultProfile(4, 'outin');
    // 동타 on the beat, then three 16ths: the right hand plays 7+6 then 5, the left hand 3 4
    expect(lanesFrom([...beatWithChord, ...beatWithChord, 180], 480, 120, outin)).toBe(
      '765' + '34' + '765' + '34' + '65',
    );
    // a 동타 alone in its hand's turn keeps the hand's own two fingers (6+5 / 3+4)
    const figure = [...twoSixteenths, ...chordRest];
    expect(lanesFrom([...figure, ...figure, 180], 480, 120, outin).slice(0, 8)).toBe(
      '65' + '34' + '65' + '34',
    );
  });

  it('rolls a 드르륵 (32nds for half a beat inside a 2키 trill) as one 4키 roll, 안밖 and 밖안', () => {
    const s16 = (n: number) => Array<number>(n).fill(180);
    // 16th trill, then five 32nds from the half beat to the beat, then the trill again (Feral #902)
    const toBeat = [...s16(6), 90, 90, 90, 90, ...s16(3)];
    expect(lanesFrom(toBeat, 960, 240, defaultProfile(2, 'inout'))).toBe('545454' + '56435' + '454');
    expect(lanesFrom(toBeat, 960, 240, defaultProfile(2, 'outin'))).toBe('545454' + '65346' + '454');
    // four 32nds from the beat, a 동타 on the half beat, then the trill (Feral #1321)
    const intoChord = [...s16(8), 90, 90, 90, 90, 30, 150, ...s16(3)];
    expect(lanesFrom(intoChord, 960, 240, defaultProfile(2, 'inout'))).toBe(
      '54545454' + '5643' + '56' + '4545',
    );
    expect(lanesFrom(intoChord, 960, 240, defaultProfile(2, 'outin'))).toBe(
      '54545454' + '6534' + '65' + '4545',
    );
  });

  it('does the same with 6 and 8 keys', () => {
    const p6 = custom([band('567432')]);
    const lv = parseLevel(
      JSON.stringify({
        angleData: anglesFrom([...beatWithChord, 180, 180, 180]),
        settings: { bpm: 480, offset: 0 },
        actions: [],
      }),
    );
    const t = computeTiming(lv);
    const a = analyzeRhythm(t, SEC);
    // 6키 567432: the right hand takes 5+6 for its first slot, its next two slots move out to 7 and 8, then 4 3 2
    expect(
      formatOrder([
        ...assignFingering(
          a,
          t.notes.map((n) => n.floor),
          p6,
        ).noteLane,
      ]).slice(0, 7),
    ).toBe('5678432');
  });
});
