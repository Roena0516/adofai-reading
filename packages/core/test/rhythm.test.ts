import { describe, expect, it } from 'vitest';
import {
  analyzeRhythm,
  computeTiming,
  detectSections,
  divisionLabel,
  groupChords,
  isRegularBeats,
  isSimpleRatio,
  metricWeight,
  resolveSections,
} from '../src';
import type { Timing } from '../src';
import { hasFixture, loadFixture, makeLevel } from './helpers';

/** Build a fake timing from note times (seconds) for rhythm-only tests. */
function fakeTiming(noteTimes: number[], bpm = 120): Timing {
  const tiles = [
    { floor: 0, time: noteTimes[0]! - 60 / bpm, bpm },
    ...noteTimes.map((t, i) => ({ floor: i + 1, time: t, bpm })),
  ];
  return {
    tiles: tiles.map((t) => ({
      ...t,
      angle: 0,
      isMidspin: false,
      clockwise: true,
      entry: 180,
      rotation: 180,
      beats: 1,
      duration: 60 / bpm,
      pauseBeats: 0,
      holdTurns: 0,
      autoplay: false,
      planets: 2,
    })),
    notes: noteTimes.map((time, i) => ({ id: i, floor: i + 1, time, bpm, endTime: null, autoplay: false })),
    noteTimes: Float64Array.from(noteTimes),
    warnings: [],
    endTime: noteTimes.at(-1)!,
  };
}
const beatsToSec = (beats: number[], bpm = 120) => beats.map((b) => (b * 60) / bpm);

describe('ratios and grids', () => {
  it('classifies rhythmic ratios', () => {
    expect(isSimpleRatio(2)).toBe(true);
    expect(isSimpleRatio(1.5)).toBe(true);
    expect(isSimpleRatio(10)).toBe(true);
    expect(isSimpleRatio(1.125)).toBe(false);
    expect(isSimpleRatio(1.25)).toBe(false);
  });

  it('regular beats sit on 1/48 or 1/32 grids', () => {
    expect(isRegularBeats(0.25)).toBe(true);
    expect(isRegularBeats(1 / 3)).toBe(true);
    expect(isRegularBeats(1 / 32)).toBe(true);
    expect(isRegularBeats(3 / 14)).toBe(false);
  });

  it('weights metrical positions', () => {
    expect(metricWeight(4)).toBe(7);
    expect(metricWeight(1)).toBe(5);
    expect(metricWeight(0.5)).toBe(4);
    expect(metricWeight(0.25)).toBe(3);
    expect(metricWeight(0.123)).toBe(2);
    expect(metricWeight(0.11)).toBe(0);
  });

  it('labels divisions the way players say them', () => {
    expect(divisionLabel(4)).toBe('16비트');
    expect(divisionLabel(8)).toBe('32비트');
    expect(divisionLabel(3)).toBe('12비트');
    expect(divisionLabel(null, 3.5)).toContain('비정형');
  });
});

describe('groupChords', () => {
  const opts = { thresholdMs: 40, maxSize: 4, isolation: 2.5 };
  it('groups an isolated pseudo pair', () => {
    expect(groupChords([0, 0.005, 0.5, 1], opts)).toEqual([
      [0, 2],
      [2, 1],
      [3, 1],
    ]);
  });

  it('does not treat a fast stream as one chord', () => {
    const stream = Array.from({ length: 12 }, (_, i) => i * 0.03);
    expect(groupChords(stream, opts).every(([, c]) => c === 1)).toBe(true);
  });

  it('finds a pseudo pair inside a fast stream', () => {
    const t = [0, 0.037, 0.074, 0.079, 0.116, 0.153];
    expect(groupChords(t, opts)).toEqual([
      [0, 1],
      [1, 1],
      [2, 2],
      [4, 1],
      [5, 1],
    ]);
  });
});

describe('detectSections', () => {
  it('keeps one section when BPM changes only encode rhythm', () => {
    const t = computeTiming(
      makeLevel('RRRRRRRRRRRRRRRRRRRR', {
        actions: [
          { floor: 4, eventType: 'SetSpeed', speedType: 'Bpm', beatsPerMinute: 480 },
          { floor: 12, eventType: 'SetSpeed', speedType: 'Bpm', beatsPerMinute: 240 },
        ],
      }),
    );
    expect(detectSections(t).map((s) => s.bpm)).toEqual([120]);
  });

  it('finds a real tempo change', () => {
    const t = computeTiming(
      makeLevel('R'.repeat(40), {
        actions: [{ floor: 16, eventType: 'SetSpeed', speedType: 'Bpm', beatsPerMinute: 135 }],
      }),
    );
    const s = detectSections(t);
    expect(s.map((x) => [x.startFloor, x.bpm])).toEqual([
      [0, 120],
      [16, 135],
    ]);
  });

  it('resolves user edits to chart times', () => {
    const t = computeTiming(makeLevel('RRRRRRRR'));
    const s = resolveSections([{ floor: 4, bpm: 150 }], t.tiles);
    expect(s.map((x) => [x.startFloor, x.bpm])).toEqual([
      [1, 150],
      [4, 150],
    ]);
    expect(s[1]!.startTime).toBeCloseTo(1.5, 6);
  });
});

describe('analyzeRhythm', () => {
  it('splits a 16th stream and a 32nd burst into runs and snaps divisions', () => {
    const beats = [0, 0.25, 0.5, 0.75, 1, 1.125, 1.25, 1.375, 1.5, 2.5];
    const timing = fakeTiming(beatsToSec(beats));
    const a = analyzeRhythm(timing, [{ startFloor: 0, startTime: 0, bpm: 120 }]);
    expect(a.runs.map((r) => [r.firstEvent, r.lastEvent, r.division])).toEqual([
      [0, 3, 4],
      [4, 8, 8],
      [9, 9, 1],
    ]);
    expect(a.events[4]!.effBpm).toBeCloseTo(960, 6);
    expect(a.events[4]!.metric).toBe(5);
  });
});

describe.skipIf(!hasFixture('MEGAMIX.zip'))('MEGAMIX sections', () => {
  it('detects 160 → 180 and ignores 7-tuplet ornaments', async () => {
    const t = computeTiming(await loadFixture('MEGAMIX.zip'));
    expect(detectSections(t).map((s) => [s.startFloor, s.bpm])).toEqual([
      [0, 160],
      [1197, 180],
    ]);
  });
});

describe.skipIf(!hasFixture('Flower Rocket.zip'))('Flower Rocket sections', () => {
  it('stays at 230 BPM and most events snap to the grid', async () => {
    const t = computeTiming(await loadFixture('Flower Rocket.zip'));
    const sections = detectSections(t);
    expect(sections.map((s) => s.bpm)).toEqual([230]);
    const a = analyzeRhythm(t, sections);
    const snapped = a.events.filter((e) => e.division !== null).length / a.events.length;
    expect(snapped).toBeGreaterThan(0.95);
  });
});
