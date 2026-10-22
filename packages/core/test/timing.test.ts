import { describe, expect, it } from 'vitest';
import { computeTiming } from '../src';
import { hasFixture, loadFixture, makeLevel } from './helpers';

const times = (path: string, opts?: Parameters<typeof makeLevel>[1]) =>
  computeTiming(makeLevel(path, opts)).notes.map((n) => Number(n.time.toFixed(6)));

describe('computeTiming', () => {
  it('straight tiles are one beat apart, first hit at the offset', () => {
    expect(times('RRRR', { offset: 1000 })).toEqual([1, 1.5, 2, 2.5]);
  });

  it('the offset marks the planet passing 0°, so a bent first tile shifts the first hit', () => {
    // first tile up (90°): reached half a beat before the planet points right
    expect(times('URR', { offset: 1000 })).toEqual([0.75, 1.5, 2]);
    // first tile left (U-turn): a full turn, one beat after
    expect(times('LL', { offset: 1000 })[0]).toBeCloseTo(1.5, 9);
    // twirl on the start tile reverses the first rotation (270° to reach up)
    expect(times('UR', { offset: 1000, actions: [{ floor: 0, eventType: 'Twirl' }] })[0]).toBeCloseTo(
      1.25,
      9,
    );
  });

  it('a U-turn takes a full rotation (2 beats)', () => {
    expect(times('RL')).toEqual([0, 1]);
  });

  it('a 90° clockwise turn takes half a beat', () => {
    expect(times('RUU')).toEqual([0, 0.25, 0.75]);
  });

  it('twirl reverses direction from its own floor', () => {
    expect(times('RUU', { actions: [{ floor: 1, eventType: 'Twirl' }] })).toEqual([0, 0.75, 1.25]);
  });

  it('applies Bpm and Multiplier speed changes', () => {
    const actions = [
      { floor: 1, eventType: 'SetSpeed', speedType: 'Bpm', beatsPerMinute: 240 },
      { floor: 2, eventType: 'SetSpeed', speedType: 'Multiplier', bpmMultiplier: 2 },
    ];
    expect(times('RRRR', { actions })).toEqual([0, 0.25, 0.375, 0.5]);
  });

  it('adds pause beats to the floor that carries them', () => {
    expect(times('RRR', { actions: [{ floor: 1, eventType: 'Pause', duration: 2 }] })).toEqual([0, 1.5, 2]);
  });

  it('a midspin is not a separate press and reverses in half a turn', () => {
    const t = computeTiming(makeLevel('R!L'));
    expect(t.notes.map((n) => n.floor)).toEqual([1, 3]);
    expect(t.notes.map((n) => n.time)).toEqual([0, 0.5]);
  });

  it('marks autoplay notes', () => {
    const t = computeTiming(
      makeLevel('RRRR', { actions: [{ floor: 2, eventType: 'AutoPlayTiles', enabled: true }] }),
    );
    expect(t.notes.map((n) => n.autoplay)).toEqual([false, true, true, true]);
  });

  it('turns a hold into one long note and warns that the rule is estimated', () => {
    const t = computeTiming(makeLevel('RRRR', { actions: [{ floor: 2, eventType: 'Hold', duration: 1 }] }));
    expect(t.notes.map((n) => n.floor)).toEqual([1, 2, 4]);
    expect(t.notes[1]!.endTime).toBeCloseTo(0.5 + 1.5, 6);
    expect(t.warnings.length).toBe(1);
  });
});

describe.skipIf(!hasFixture('Flower Rocket.zip'))('Flower Rocket fixture', () => {
  it('matches the validated note count and end time', async () => {
    const t = computeTiming(await loadFixture('Flower Rocket.zip'));
    expect(t.notes.length).toBe(2572);
    // first tile is 'U': half a beat (230 BPM) before the 1053 ms offset
    expect(t.notes[0]!.time).toBeCloseTo(1.053 - 30 / 230, 6);
    expect(t.endTime).toBeCloseTo(201.401 - 30 / 230, 2);
    expect(t.notes.at(-1)!.time).toBeLessThan(204.986);
  });
});

describe.skipIf(!hasFixture('MEGAMIX.zip'))('MEGAMIX fixture', () => {
  it('matches the validated note count and end time', async () => {
    const t = computeTiming(await loadFixture('MEGAMIX.zip'));
    expect(t.notes.length).toBe(4208);
    expect(t.notes[0]!.time).toBeCloseTo(3.14, 6);
    expect(t.endTime).toBeCloseTo(597.793, 2);
    expect(t.notes.at(-1)!.time).toBeLessThan(603.916);
  });
});
