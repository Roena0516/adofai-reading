import { describe, expect, it } from 'vitest';
import { computeTiming, computeTrack, planetsAt, planetsOn } from '../src';
import { makeLevel } from './helpers';

const pts = (path: string) => {
  const t = computeTrack(makeLevel(path).angles);
  return Array.from(t.x, (x, i) => [Math.round(x * 1000) / 1000 + 0, Math.round(t.y[i]! * 1000) / 1000 + 0]);
};

describe('computeTrack', () => {
  it('steps one unit in each exit direction', () => {
    expect(pts('RUL')).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it('puts the floor after a midspin back on the tile before it', () => {
    expect(pts('R!L')).toEqual([
      [0, 0],
      [1, 0],
      [0, 0],
      [-1, 0],
    ]);
  });
});

describe('planetsAt', () => {
  it('orbits clockwise from the entry direction and reaches the next tile on its hit', () => {
    const level = makeLevel('RRUR');
    const timing = computeTiming(level);
    const track = computeTrack(level.angles);
    const at1 = planetsAt(timing, track, timing.tiles[1]!.time);
    expect(at1.floor).toBe(1);
    expect(at1.angle).toBeCloseTo(180, 6);
    const mid = planetsAt(timing, track, timing.tiles[1]!.time + timing.tiles[1]!.duration / 2);
    expect(mid.angle).toBeCloseTo(90, 6);
    expect(planetsAt(timing, track, timing.tiles[2]!.time).pivotPlanet).not.toBe(at1.pivotPlanet);
  });
});

describe('planetsOn', () => {
  it('starts a little behind after an early hit and swings past the next tile while waiting', () => {
    const level = makeLevel('RRUR');
    const timing = computeTiming(level);
    const track = computeTrack(level.angles);
    const t1 = timing.tiles[1]!;
    // a straight tile turns 180° per beat, clockwise from 180°
    const early = planetsOn(timing, track, 1, t1.time - t1.duration / 18);
    expect(early.floor).toBe(1);
    expect(early.angle).toBeCloseTo(190, 6);
    const waiting = planetsOn(timing, track, 1, t1.time + (t1.duration * 4) / 3);
    expect(waiting.angle).toBeCloseTo(-60, 6);
  });
});
