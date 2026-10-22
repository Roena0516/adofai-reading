import { describe, expect, it } from 'vitest';
import { JUDGE, Judge, adofaiWindows, computeStats, fixedWindows, judgeLabel } from '../src';

const W = { perfectMs: 25, nearMs: 50, farMs: 90 };
const judge = (times: number[], lanes: number[], auto: number[]) =>
  new Judge(times, lanes, auto, fixedWindows(times.length, W));

describe('Judge', () => {
  it('judges timing in the matching lane', () => {
    const j = judge([1, 2], [2, 3], [0, 0]);
    j.reset(0);
    expect(j.press(2, 1.01)).toMatchObject({ note: 0, code: JUDGE.perfect });
    expect(j.press(3, 2.06)).toMatchObject({ note: 1, code: JUDGE.far });
  });

  it('reports the wrong finger when only another lane has a note in time', () => {
    const j = judge([1], [2], [0]);
    j.reset(0);
    expect(j.press(0, 1.0)).toMatchObject({ note: 0, code: JUDGE.wrong, expectedLane: 2 });
  });

  it('prefers the same lane over an earlier note in another lane', () => {
    const j = judge([1.0, 1.03], [1, 2], [0, 0]);
    j.reset(0);
    expect(j.press(2, 1.03)).toMatchObject({ note: 1, code: JUDGE.perfect });
  });

  it('calls presses before every window too early without using a note, and misses late notes', () => {
    const j = judge([1, 2], [0, 0], [0, 0]);
    j.reset(0);
    expect(j.press(0, 0.5)).toMatchObject({ note: 0, code: JUDGE.tooEarly });
    expect(j.result[0]).toBe(JUDGE.none);
    expect(j.update(1.2).map((h) => h.note)).toEqual([0]);
    expect(j.result[0]).toBe(JUDGE.miss);
  });

  it('skips autoplay notes and notes before the start point', () => {
    const j = judge([1, 2, 3], [0, 0, 0], [0, 1, 0]);
    j.reset(1.5);
    expect(j.result[0]).toBe(JUDGE.skipped);
    expect(j.update(2.5)).toEqual([]);
    expect(j.result[1]).toBe(JUDGE.auto);
  });

  it('summarises accuracy and per-lane offsets', () => {
    const j = judge([1, 2, 3, 4], [0, 1, 0, 1], [0, 0, 0, 0]);
    j.reset(0);
    j.press(0, 1.01);
    j.press(1, 2.03);
    j.press(1, 3.0);
    j.update(5);
    const s = computeStats(j, [0, 1, 0, 1], 2, false);
    expect([s.perfect, s.near, s.wrong, s.miss]).toEqual([1, 1, 1, 1]);
    expect(s.lanes[0]!.meanMs).toBeCloseTo(10, 3);
    expect(s.accuracy).toBeCloseTo((1 + 0.75 + 0.5) / 4, 6);
  });

  it('uses the game windows: angles at low BPM, the option floor at high BPM', () => {
    // 120 BPM: 60° = ⅓ beat = 166.7 ms, 30° = 83.3 ms; 1000 BPM is past every threshold
    const w = adofaiWindows([120, 1000], 'normal');
    expect(w.far[0]).toBeCloseTo(166.67, 1);
    expect(w.perfect[0]).toBeCloseTo(83.33, 1);
    expect([w.perfect[1], w.near[1], w.far[1]].map((x) => Math.round(x! * 100) / 100)).toEqual([
      32.5, 48.75, 65,
    ]);
    expect(adofaiWindows([1000], 'strict').perfect[0]).toBeCloseTo(25, 3);
    expect(adofaiWindows([1000], 'lenient').far[0]).toBeCloseTo(91, 3);

    const j = new Judge([1, 1.1], [0, 0], [0, 0], w);
    j.reset(0);
    const early = j.press(0, 1 - 0.1)!;
    expect(early).toMatchObject({ note: 0, code: JUDGE.near });
    expect(judgeLabel(early.code, early.offsetMs)).toBe('빠름');
    const late = j.press(0, 1.1 + 0.05)!;
    expect(late).toMatchObject({ note: 1, code: JUDGE.far });
    expect(judgeLabel(late.code, late.offsetMs)).toBe('느림');
  });
});
