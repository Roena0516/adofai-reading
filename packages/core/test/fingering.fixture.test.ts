import { describe, expect, it } from 'vitest';
import type { BaseSwitch, FingeringResult, RhythmAnalysis } from '../src';
import {
  analyzeRhythm,
  assignFingering,
  buildLanes,
  computeTiming,
  defaultProfile,
  detectSections,
  formatOrder,
  FULL_FINGERS,
} from '../src';
import { hasFixture, loadFixture } from './helpers';

const LANES = buildLanes(FULL_FINGERS);

/** How the two-hand trill (54) parts of a fingering hold up: hands on the strong / weak halves, middle fingers. */
function trillReport(a: RhythmAnalysis, f: FingeringResult, onlyBase?: number) {
  const out = { strongOnLeft: [] as number[], weakOnRight: [] as number[], middleSingles: [] as number[] };
  for (const run of a.runs) {
    if (formatOrder(f.runSeq[run.index]!) !== '54') continue;
    if (onlyBase != null && f.runBase[run.index] !== onlyBase) continue;
    const step = (run.speedGap * run.baseBpm) / 60; // beats between notes
    for (let e = run.firstEvent; e <= run.lastEvent; e++) {
      const ev = a.events[e]!;
      const lane = LANES[f.noteLane[ev.firstNote]!]!;
      if (ev.noteCount === 1 && lane.finger === 'middle') out.middleSingles.push(ev.floor);
      // the stronger half of each trill pair sits on multiples of two steps
      const q = ev.beatPos / (2 * step);
      const d = Math.abs(q - Math.round(q));
      if (d < 0.02 && lane.hand === 'L') out.strongOnLeft.push(ev.floor);
      if (Math.abs(d - 0.5) < 0.02 && lane.hand === 'R') out.weakOnRight.push(ev.floor);
    }
  }
  return out;
}

describe.skipIf(!hasFixture('Flower Rocket.zip'))('Flower Rocket on the 2키 base', () => {
  const setup = async () => {
    const t = computeTiming(await loadFixture('Flower Rocket.zip'));
    return { t, a: analyzeRhythm(t, detectSections(t)), floors: t.notes.map((n) => n.floor) };
  };

  it('keeps the right hand on the strong half of every trill, 안밖 and 밖안', async () => {
    const { a, floors } = await setup();
    for (const style of ['inout', 'outin'] as const) {
      const r = trillReport(a, assignFingering(a, floors, defaultProfile(2, style)));
      expect(r).toEqual({ strongOnLeft: [], weakOnRight: [], middleSingles: [] });
    }
  });

  it('does the same from #2437 on when a 밖안 4키 profile switches to 2키 there', async () => {
    const { a, floors } = await setup();
    const bases: BaseSwitch[] = [{ floor: 2437, base: 2 }];
    const f = assignFingering(a, floors, defaultProfile(4, 'outin'), { bases });
    const r = trillReport(a, f, 2);
    expect(r).toEqual({ strongOnLeft: [], weakOnRight: [], middleSingles: [] });
  });
});
