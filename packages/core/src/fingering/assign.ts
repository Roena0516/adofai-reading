import type { Run, RhythmAnalysis } from '../rhythm/analyze';
import { mod } from '../util/math';
import type { Lane } from './layout';
import { FINGER_RANK, buildLanes, homeLane } from './layout';
import { parseOrder } from './order';
import { effectiveBands } from './presets';
import type { Band, ChordAssign, FingeringProfile, SpeedUnit } from './profile';

/** Apply a literal lane sequence to every note in a floor range (e.g. "3222322232232232"). */
export interface RangeOverride {
  id: string;
  fromFloor: number;
  toFloor: number;
  sequence: string;
  enabled: boolean;
}

export interface FingeringOverrides {
  ranges: RangeOverride[];
  /** floor → 0-based lane */
  notes: Record<string, number>;
}

export const LANE_SOURCE = { auto: 0, range: 1, note: 2 } as const;

export interface FingeringResult {
  lanes: Lane[];
  noteLane: Int16Array;
  noteSource: Uint8Array;
  /** Band index per run (-1 when the profile has no bands). */
  runBand: Int16Array;
  /** Resolved lane cycle per run. */
  runSeq: number[][];
  /** Parsed order per band, null when invalid. */
  bandSeqs: (number[] | null)[];
  errors: string[];
}

export function speedValue(run: Run, unit: SpeedUnit): number {
  if (unit === 'beat') return 4 * (run.division ?? run.divisionRaw);
  return run.effBpm;
}

export function pickBand(bands: Band[], value: number): number {
  for (let i = 0; i < bands.length; i++) {
    const up = bands[i]!.upTo;
    if (up == null || value <= up * 1.02) return i;
  }
  return bands.length - 1;
}

function mirrorLane(lanes: Lane[], i: number): number | undefined {
  const src = lanes[i]!;
  return lanes.find((l) => l.hand !== src.hand && l.finger === src.finger)?.index;
}

function nextInHand(
  lanes: Lane[],
  i: number,
  used: Set<number>,
  direction: 'out' | 'in' = 'out',
): number | undefined {
  const src = lanes[i]!;
  const rank = FINGER_RANK[src.finger];
  const step = direction === 'out' ? 1 : -1;
  const own = lanes.filter((l) => l.hand === src.hand && !used.has(l.index));
  const at = (r: number) => own.find((l) => FINGER_RANK[l.finger] === r)?.index;
  for (let d = 1; d <= 4; d++) {
    const pick = at(rank + step * d) ?? at(rank - step * d);
    if (pick !== undefined) return pick;
  }
  return undefined;
}

function nearestFree(lanes: Lane[], ref: number, used: Set<number>): number {
  const src = lanes[ref]!;
  let best = -1;
  let bestScore = Infinity;
  for (const l of lanes) {
    if (used.has(l.index)) continue;
    const score =
      Math.abs(FINGER_RANK[l.finger] - FINGER_RANK[src.finger]) +
      (l.hand === src.hand ? 0 : 0.5) +
      l.index * 1e-3;
    if (score < bestScore) {
      bestScore = score;
      best = l.index;
    }
  }
  return best < 0 ? ref : best;
}

/** Lanes for one event; a chord never puts two notes on the same finger if avoidable. */
export function chordLanes(
  seq: number[],
  idx: number,
  count: number,
  mode: ChordAssign,
  lanes: Lane[],
  direction: 'out' | 'in' = 'out',
): number[] {
  const first = seq[mod(idx, seq.length)]!;
  const out = [first];
  const used = new Set(out);
  for (let k = 1; k < count; k++) {
    let cand: number | undefined;
    if (mode === 'cycle') cand = seq[mod(idx + k, seq.length)];
    else if (mode === 'otherHand') cand = k === 1 ? mirrorLane(lanes, first) : undefined;
    else cand = nextInHand(lanes, out[k - 1]!, used, direction);
    if (cand === undefined || used.has(cand)) cand = nearestFree(lanes, out[k - 1]!, used);
    out.push(cand);
    used.add(cand);
  }
  return out;
}

export interface HandGroups {
  /** Group index of each slot of the order. */
  groupOf: Int16Array;
  /** Position of each slot inside its group. */
  posInGroup: Int16Array;
  /** Finger a group uses at a position; past the group's end it keeps rolling over that hand. */
  fingerAt: (group: number, pos: number) => number;
}

/**
 * Split an order into hand groups (5643 → R[5,6] L[4,3]). Inside a group the hand rolls in the
 * group's direction; extra fingers (a 동타 taking two at once) push its later notes further along
 * that hand (5+6, 7), and the next group starts again from its own first finger.
 */
export function handGroups(seq: number[], lanes: Lane[], defaultDir: 1 | -1): HandGroups {
  const groupOf = new Int16Array(seq.length);
  const posInGroup = new Int16Array(seq.length);
  const groups: number[][] = [];
  seq.forEach((l, i) => {
    const prev = i > 0 ? seq[i - 1]! : -1;
    if (i === 0 || lanes[l]!.hand !== lanes[prev]!.hand) groups.push([]);
    const g = groups.length - 1;
    groupOf[i] = g;
    posInGroup[i] = groups[g]!.length;
    groups[g]!.push(l);
  });
  const ext = groups.map((grp) => {
    const hand = lanes[grp[0]!]!.hand;
    const own = lanes
      .filter((l) => l.hand === hand)
      .sort((a, b) => FINGER_RANK[a.finger] - FINGER_RANK[b.finger]);
    const start = own.findIndex((l) => l.index === grp[0]);
    const dir =
      grp.length > 1
        ? Math.sign(FINGER_RANK[lanes[grp[1]!]!.finger] - FINGER_RANK[lanes[grp[0]!]!.finger]) || defaultDir
        : defaultDir;
    const out: number[] = [];
    for (let i = start; i >= 0 && i < own.length; i += dir) out.push(own[i]!.index);
    for (let i = start - dir; i >= 0 && i < own.length; i -= dir) out.push(own[i]!.index);
    return out;
  });
  return {
    groupOf,
    posInGroup,
    fingerAt: (g, pos) => {
      const grp = groups[g]!;
      if (pos < grp.length) return grp[pos]!;
      const e = ext[g]!;
      // past the group: continue from the group's last finger along the hand
      const last = e.indexOf(grp[grp.length - 1]!);
      return e[(last + 1 + pos - grp.length) % e.length]!;
    },
  };
}

interface RunSim {
  /** Lane of each note of the run. */
  lanes: number[];
  endSlot: number;
  endShift: number;
  cost: number;
  /** Lanes of the run's first and last events. */
  first: number[];
  last: number[];
  /** Each hand's first and last touch in the run, to catch a finger repeated across runs. */
  handFirst: Partial<Record<'L' | 'R', HandTouch>>;
  handLast: Partial<Record<'L' | 'R', HandTouch>>;
}

interface Option {
  sim: RunSim;
  /** Cost of moving into the run plus the run itself. */
  cost: number;
}

interface HandTouch {
  lanes: number[];
  /** Start and end time of the event. */
  time: number;
  end: number;
}

const touchesRepeat = (a: HandTouch | undefined, b: HandTouch | undefined, within: number) =>
  !!a && !!b && b.time - a.end < within && b.lanes.some((l) => a.lanes.includes(l));

/** How awkward a choice is; each run of a stream starts where it costs least. */
const COST = {
  /** A one-hand 동타 that does not start on the hand's first finger (중약 instead of 검중). */
  chordOffStart: 1.5,
  /** A one-hand 동타 on the off hand (halved for each later 동타 of the run). */
  chordOffHand: 0.6,
  /** Moving the hand phase at a rest or a change of order. */
  rephase: 0.5,
  /** The same finger twice within sameFingerMinMs. */
  sameFinger: 1,
  /** The same hand again right after a short rest. */
  sameHand: 0.3,
  sameHandWithin: 0.2,
  /** A run without 동타 whose strong beat is not on the order's first finger. */
  offBeat: 0.6,
  /** Starting a run one finger further along its hand. */
  startShift: 0.2,
  /** How far ahead (in beats) a run's start looks at the runs that follow. */
  lookaheadBeats: 4,
};

function timeOfLastNote(analysis: RhythmAnalysis, note: number, fallback: number): number {
  const ev = analysis.events[analysis.noteEvent[note]!];
  return ev && ev.firstNote === note ? ev.time : (analysis.noteTimes[note] ?? fallback);
}

/**
 * Assign a lane (finger) to every note.
 *
 * Each run picks the band that matches its speed and cycles its order over the run's events.
 * Runs joined by short rests form a stream: it starts on the anchor finger, and later runs keep
 * the hands alternating, re-phasing only where it puts 동타 on the main hand's index-led fingers.
 * Range and per-note overrides are applied last.
 */
export function assignFingering(
  analysis: RhythmAnalysis,
  noteFloors: ArrayLike<number>,
  profile: FingeringProfile,
  overrides?: Partial<FingeringOverrides>,
): FingeringResult {
  const lanes = buildLanes(profile.fingers);
  const L = lanes.length;
  const noteCount = analysis.noteEvent.length;
  const noteLane = new Int16Array(noteCount);
  const noteSource = new Uint8Array(noteCount);
  const runBand = new Int16Array(analysis.runs.length).fill(-1);
  const runSeq: number[][] = new Array(analysis.runs.length);
  const errors: string[] = [];

  if (L === 0) {
    errors.push('손가락이 하나도 선택되지 않았습니다.');
    return { lanes, noteLane, noteSource, runBand, runSeq: runSeq.fill([]), bandSeqs: [], errors };
  }

  const fallback = [homeLane(lanes, profile.mainHand)];
  const { bands, speedUnit } = effectiveBands(profile);
  const bandSeqs = bands.map((b, i) => {
    const p = parseOrder(b.order, L);
    if (p.error) {
      errors.push(`속도 구간 ${i + 1}: ${p.error}`);
      return null;
    }
    return p.seq;
  });
  // Each event takes one slot of the order (a non-one-hand chord in cycle mode takes one per note).
  const slotsOf = (ev: { noteCount: number; oneHand: boolean }) =>
    !ev.oneHand && profile.chord.assign === 'cycle' ? ev.noteCount : 1;
  const groupCache = new Map<number[], HandGroups>();
  const groupsFor = (seq: number[]) => {
    let g = groupCache.get(seq);
    if (!g) {
      g = handGroups(seq, lanes, profile.chord.oneHandDirection === 'in' ? -1 : 1);
      groupCache.set(seq, g);
    }
    return g;
  };

  const minSame = profile.run.sameFingerMinMs / 1000;
  const runs = analysis.runs;
  const events = analysis.events;

  // Per-run order and timing.
  const info = runs.map((run) => {
    const bi = bands.length ? pickBand(bands, speedValue(run, speedUnit)) : -1;
    const seq = (bi >= 0 ? bandSeqs[bi] : null) ?? fallback;
    const last = events[run.lastEvent]!;
    runBand[run.index] = bi;
    runSeq[run.index] = seq;
    const anchorLane = bi >= 0 ? bands[bi]!.anchor : null;
    const anchorPos = anchorLane != null ? Math.max(0, seq.indexOf(anchorLane - 1)) : 0;
    return {
      bi,
      seq,
      hg: groupsFor(seq),
      /** The finger that should take the strong beat (5 for 안밖). */
      beatLane: seq[anchorPos]!,
      firstTime: events[run.firstEvent]!.time,
      lastNoteTime: timeOfLastNote(analysis, last.firstNote + last.noteCount - 1, last.time),
      endTime: last.endTime,
    };
  });

  // A run carries on from the previous one when the hands are already alternating and the rest
  // between them is short; a chain of such runs is one stream whose hand phase is chosen as a whole.
  const carry = new Uint8Array(runs.length);
  let flowing = false;
  runs.forEach((run, i) => {
    const restLimit = (profile.run.restBeats * 60) / run.baseBpm;
    carry[i] = Number(
      i > 0 &&
        profile.run.reanchor === 'rest' &&
        flowing &&
        info[i]!.firstTime - info[i - 1]!.lastNoteTime <= restLimit + 1e-9,
    );
    // a lone 동타 counts too: that hand has had its turn, so the other hand plays next
    flowing = info[i]!.seq.length >= 2 && (carry[i] === 1 || run.eventCount >= 2 || run.noteCount >= 2);
  });

  /** Play a run from a slot of its order; the cost counts awkward 동타 and finger repeats. */
  const simulate = (run: Run, startSlot: number, startShift: number): RunSim => {
    const { seq, hg } = info[run.index]!;
    const len = seq.length;
    let slot = startSlot;
    let shift = startShift;
    let cost = 0;
    const out: number[] = [];
    let first: number[] = [];
    let prev: number[] = [];
    let chordsSeen = 0;
    let slotsSeen = 0;
    let beatWeight = -1;
    let beatLane = -1;
    const handFirst: RunSim['handFirst'] = {};
    const handLast: RunSim['handLast'] = {};
    for (let e = run.firstEvent; e <= run.lastEvent; e++) {
      const ev = events[e]!;
      slot = mod(slot, len);
      const g = hg.groupOf[slot]!;
      const k = hg.posInGroup[slot]!;
      if (k === 0 && e > run.firstEvent) shift = 0; // the hand starts a new pass of its group
      let picked: number[];
      if (ev.oneHand) {
        // one hand plays all notes with its next fingers; that hand's later notes move outwards too
        picked = Array.from({ length: ev.noteCount }, (_, j) => hg.fingerAt(g, k + shift + j));
        if (ev.noteCount > 1) {
          if (k + shift > 0) cost += COST.chordOffStart;
          // the hand is chosen from the 동타 a player sees as the run starts, not from a long run's tally
          if (lanes[picked[0]!]!.hand !== profile.mainHand) cost += COST.chordOffHand * 0.5 ** chordsSeen;
          chordsSeen++;
        }
        shift += ev.noteCount - 1;
      } else if (ev.noteCount > 1) {
        picked = chordLanes(
          seq,
          slot,
          ev.noteCount,
          profile.chord.assign,
          lanes,
          profile.chord.oneHandDirection,
        );
        shift = 0;
      } else {
        picked = [hg.fingerAt(g, k + shift)];
      }
      // a hand playing a finger it used a moment ago (5+6 · 3 · 5 within 130 ms)
      const end = timeOfLastNote(analysis, ev.firstNote + ev.noteCount - 1, ev.time);
      for (const hand of ['L', 'R'] as const) {
        const own = picked.filter((l) => lanes[l]!.hand === hand);
        if (!own.length) continue;
        const touch = { lanes: own, time: ev.time, end };
        if (touchesRepeat(handLast[hand], touch, minSame)) cost += COST.sameFinger;
        handFirst[hand] ??= touch;
        handLast[hand] = touch;
      }
      if (e === run.firstEvent) first = picked;
      if (slotsSeen < len && ev.metric > beatWeight + 1e-9) {
        beatWeight = ev.metric;
        beatLane = picked[0]!;
      }
      out.push(...picked);
      prev = picked;
      slot += slotsOf(ev);
      slotsSeen += slotsOf(ev);
    }
    // Without 동타 to place, a run keeps its first finger on the strong beat (약박은 왼손).
    if (chordsSeen === 0 && beatWeight >= 4 && beatLane !== info[run.index]!.beatLane) cost += COST.offBeat;
    return {
      lanes: out,
      endSlot: mod(slot, len),
      endShift: shift,
      cost,
      first,
      last: prev,
      handFirst,
      handLast,
    };
  };

  let lastLanes: number[] = [];
  let lastTime = -Infinity;
  for (let head = 0; head < runs.length;) {
    let tail = head;
    while (tail + 1 < runs.length && carry[tail + 1]) tail++;

    // The stream's first run starts fresh: the anchor finger on its first note (or strongest beat).
    const run0 = runs[head]!;
    const { bi, seq } = info[head]!;
    const len = seq.length;
    const anchorLane = bi >= 0 ? bands[bi]!.anchor : null;
    let anchorPos = anchorLane != null ? seq.indexOf(anchorLane - 1) : 0;
    if (anchorPos < 0) anchorPos = 0;
    let bestSlots = 0;
    if (profile.run.anchor === 'metric') {
      let bestW = -1;
      let slots = 0;
      for (let e = run0.firstEvent; e <= run0.lastEvent && slots < len; e++) {
        const ev = events[e]!;
        if (ev.metric > bestW + 1e-9) {
          bestW = ev.metric;
          bestSlots = slots;
        }
        slots += slotsOf(ev);
      }
    }
    let slot0 = mod(anchorPos - bestSlots, len);
    // Do not start on the finger that just played when the gap is too short for it.
    if (minSame > 0 && len > 1 && info[head]!.firstTime - lastTime < minSame) {
      for (let tries = 0; tries < len && lastLanes.includes(seq[mod(slot0, len)]!); tries++) slot0++;
    }
    slot0 = mod(slot0, len);

    // Later runs of the stream continue the hands, or re-phase at a rest or a change of order when
    // that keeps 동타 on the index-led fingers of the main hand. Like a player, each run is decided
    // as it starts, looking a few beats ahead, so a long run's tail does not move its start.
    const simCache = new Map<string, RunSim>();
    const simAt = (j: number, c: number, sh: number) => {
      const key = `${j}:${c}:${sh}`;
      let sim = simCache.get(key);
      if (!sim) simCache.set(key, (sim = simulate(runs[j]!, c, sh)));
      return sim;
    };
    /** Every way to start run j after `prev`, with its cost (transition + the run itself). */
    const optionCache = new Map<number, Map<RunSim, Option[]>>();
    const options = (j: number, prev: RunSim): Option[] => {
      let byPrev = optionCache.get(j);
      if (!byPrev) optionCache.set(j, (byPrev = new Map()));
      let out = byPrev.get(prev);
      if (!out) byPrev.set(prev, (out = computeOptions(j, prev)));
      return out;
    };
    function computeOptions(j: number, prev: RunSim): Option[] {
      const cur = info[j]!;
      const prevInfo = info[j - 1]!;
      const curLen = cur.seq.length;
      const gap = cur.firstTime - prevInfo.lastNoteTime;
      let grid: number;
      let gridShift = 0;
      let strict = false;
      if (cur.bi === prevInfo.bi) {
        // A short rest still takes its places in the order: after a 동타 on 5+6 and a 16th rest,
        // the next note is the other hand's 4, not 7.
        const unit = runs[j - 1]!.speedGap;
        const steps = unit > 0 ? Math.max(1, Math.round((cur.firstTime - prevInfo.endTime) / unit)) : 1;
        grid = mod(prev.endSlot + steps - 1, curLen);
        gridShift = Math.max(0, prev.endShift - (steps - 1));
        strict = steps === 1; // no rest: keep the hands going exactly
      } else {
        // New order: continue after the finger that just played, or switch to the other hand.
        const lastLane = prev.last[prev.last.length - 1]!;
        const p = cur.seq.indexOf(lastLane);
        const q = cur.seq.findIndex((l) => lanes[l]!.hand !== lanes[lastLane]!.hand);
        grid = mod(p >= 0 ? p + 1 : q >= 0 ? q : 0, curLen);
      }
      if (cur.hg.posInGroup[grid] === 0) gridShift = 0;
      // The grid slot, or (at a rest / new order) any slot, also started one finger further along
      // its hand (5 6 4 · 3 5+6 rather than 4 again right after 4).
      const starts: [number, number, number][] = [[grid, gridShift, 0]];
      if (!strict) {
        for (let c = 0; c < curLen; c++) {
          if (c !== grid) starts.push([c, 0, COST.rephase]);
          if (c !== grid || gridShift !== 1) starts.push([c, 1, COST.rephase + COST.startShift]);
        }
      }
      return starts.map(([c, sh, move]) => {
        const sim = simAt(j, c, sh);
        let cost = sim.cost + move;
        for (const hand of ['L', 'R'] as const)
          if (touchesRepeat(prev.handLast[hand], sim.handFirst[hand], minSame)) cost += COST.sameFinger;
        // the same hand again across at most one short rest breaks the alternation
        const near = Math.max(COST.sameHandWithin, 2.5 * runs[j]!.speedGap);
        if (gap < near && lanes[sim.first[0]!]!.hand === lanes[prev.last[0]!]!.hand) cost += COST.sameHand;
        return { sim, cost };
      });
    }

    let sim = simulate(run0, slot0, 0);
    const chosen: RunSim[] = [sim];
    for (let j = head + 1; j <= tail; j++) {
      // look ahead over the runs that start within a few beats (a long run's far end never counts)
      const horizon = (COST.lookaheadBeats * 60) / runs[j]!.baseBpm;
      let k = j;
      while (k < tail && info[k + 1]!.firstTime - info[j]!.firstTime <= horizon) k++;
      let best: RunSim | null = null;
      let bestCost = Infinity;
      for (const o of options(j, sim)) {
        let frontier = new Map<RunSim, number>([[o.sim, o.cost]]);
        for (let m = j + 1; m <= k; m++) {
          const next = new Map<RunSim, number>();
          for (const [prev, cost] of frontier)
            for (const n of options(m, prev)) {
              const c = cost + n.cost;
              if (c < (next.get(n.sim) ?? Infinity)) next.set(n.sim, c);
            }
          frontier = next;
        }
        const cost = Math.min(...frontier.values());
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = o.sim;
        }
      }
      sim = best!;
      chosen.push(sim);
    }
    chosen.forEach((st, k) => {
      const run = runs[head + k]!;
      const first = events[run.firstEvent]!.firstNote;
      st.lanes.forEach((l, n) => (noteLane[first + n] = l));
    });
    lastLanes = sim.last;
    lastTime = info[tail]!.lastNoteTime;
    head = tail + 1;
  }

  for (const range of overrides?.ranges ?? []) {
    if (!range.enabled) continue;
    const p = parseOrder(range.sequence, L);
    if (p.error) {
      errors.push(`구간 지정 ${range.fromFloor}~${range.toFloor}: ${p.error}`);
      continue;
    }
    const lo = Math.min(range.fromFloor, range.toFloor);
    const hi = Math.max(range.fromFloor, range.toFloor);
    let k = 0;
    for (let i = 0; i < noteCount; i++) {
      const fl = noteFloors[i]!;
      if (fl < lo || fl > hi) continue;
      noteLane[i] = p.seq[k % p.seq.length]!;
      noteSource[i] = LANE_SOURCE.range;
      k++;
    }
  }

  const noteOverrides = overrides?.notes ?? {};
  if (Object.keys(noteOverrides).length) {
    const byFloor = new Map<number, number>();
    for (let i = 0; i < noteCount; i++) byFloor.set(noteFloors[i]!, i);
    for (const [floor, lane] of Object.entries(noteOverrides)) {
      const i = byFloor.get(Number(floor));
      if (i === undefined || !(lane >= 0 && lane < L)) continue;
      noteLane[i] = lane;
      noteSource[i] = LANE_SOURCE.note;
    }
  }

  return { lanes, noteLane, noteSource, runBand, runSeq, bandSeqs, errors };
}
