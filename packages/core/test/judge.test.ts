import { describe, expect, it } from 'vitest';
import { JUDGE, Judge, computeStats } from '../src';

const W = { perfectMs: 25, nearMs: 50, farMs: 90 };

describe('Judge', () => {
  it('judges timing in the matching lane', () => {
    const j = new Judge([1, 2], [2, 3], [0, 0], W);
    j.reset(0);
    expect(j.press(2, 1.01)).toMatchObject({ note: 0, code: JUDGE.perfect });
    expect(j.press(3, 2.06)).toMatchObject({ note: 1, code: JUDGE.far });
  });

  it('reports the wrong finger when only another lane has a note in time', () => {
    const j = new Judge([1], [2], [0], W);
    j.reset(0);
    expect(j.press(0, 1.0)).toMatchObject({ note: 0, code: JUDGE.wrong, expectedLane: 2 });
  });

  it('prefers the same lane over an earlier note in another lane', () => {
    const j = new Judge([1.0, 1.03], [1, 2], [0, 0], W);
    j.reset(0);
    expect(j.press(2, 1.03)).toMatchObject({ note: 1, code: JUDGE.perfect });
  });

  it('ignores presses with no note nearby and misses late notes', () => {
    const j = new Judge([1, 2], [0, 0], [0, 0], W);
    j.reset(0);
    expect(j.press(0, 0.5)).toBeNull();
    expect(j.update(1.2).map((h) => h.note)).toEqual([0]);
    expect(j.result[0]).toBe(JUDGE.miss);
  });

  it('skips autoplay notes and notes before the start point', () => {
    const j = new Judge([1, 2, 3], [0, 0, 0], [0, 1, 0], W);
    j.reset(1.5);
    expect(j.result[0]).toBe(JUDGE.skipped);
    expect(j.update(2.5)).toEqual([]);
    expect(j.result[1]).toBe(JUDGE.auto);
  });

  it('summarises accuracy and per-lane offsets', () => {
    const j = new Judge([1, 2, 3, 4], [0, 1, 0, 1], [0, 0, 0, 0], W);
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
});
