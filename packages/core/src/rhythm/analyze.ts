import type { Timing } from '../timing/timing';
import { approxRel } from '../util/math';
import { groupChords } from './chords';
import type { BeatSection } from './sections';

export interface RhythmOptions {
  chordThresholdMs: number;
  chordMaxSize: number;
  chordIsolation: number;
  /** Relative tolerance for "same speed" when building runs. */
  runTolerance: number;
  /** Relative tolerance when snapping to a beat division. */
  snapTolerance: number;
  /** Turns of at most this many degrees between two notes form a one-hand double (0 = off). */
  oneHandAngle: number;
  /** …as long as the two notes are at most this far apart. */
  oneHandMaxMs: number;
  /**
   * A pair turning at most 90° at half the gap of the stream around it is one hand's double
   * (a 90° tile inside a 4-key 질주). Only in streams at least this dense (비트); 0 = off.
   */
  streamDoubleMinBeat: number;
}

export const DEFAULT_RHYTHM_OPTIONS: RhythmOptions = {
  chordThresholdMs: 40,
  chordMaxSize: 4,
  chordIsolation: 2.5,
  runTolerance: 0.08,
  snapTolerance: 0.04,
  oneHandAngle: 30,
  oneHandMaxMs: 100,
  streamDoubleMinBeat: 16,
};

/** One rhythmic event: a single note or a pseudo chord. */
export interface RhythmEvent {
  index: number;
  firstNote: number;
  noteCount: number;
  /** Played by one hand: a sharp-turn chord (≤ oneHandAngle) or a 90° pair inside a stream. */
  oneHand: boolean;
  /** The notes keep their own times (a stream double), so they are never drawn as one chord. */
  spread: boolean;
  time: number;
  /** Time of the event's last note for spread events, otherwise the same as `time`. */
  endTime: number;
  floor: number;
  section: number;
  baseBpm: number;
  /** Position in beats of the base BPM since the section start. */
  beatPos: number;
  /** Metrical strength of beatPos: 7 bar … 4 quarter, 3 eighth, 2 32nd-ish, 0 off-grid. */
  metric: number;
  gapPrev: number;
  gapNext: number;
  /** min(gapPrev, gapNext): the speed this event is played at. */
  speedGap: number;
  /** 60 / speedGap; the "질주 BPM" players talk about. */
  effBpm: number;
  /** Notes per base beat, snapped (4 = 16비트), or null if irregular. */
  division: number | null;
  divisionRaw: number;
  run: number;
}

/** Consecutive events at the same speed. */
export interface Run {
  index: number;
  firstEvent: number;
  lastEvent: number;
  eventCount: number;
  noteCount: number;
  speedGap: number;
  effBpm: number;
  division: number | null;
  divisionRaw: number;
  /** Silence before the run in seconds (Infinity for the first run). */
  restBefore: number;
  startTime: number;
  endTime: number;
  section: number;
  baseBpm: number;
}

export interface RhythmAnalysis {
  events: RhythmEvent[];
  runs: Run[];
  sections: BeatSection[];
  /** Event index of each note. */
  noteEvent: Int32Array;
  /** Time of each note (same as timing.noteTimes). */
  noteTimes: Float64Array;
  options: RhythmOptions;
}

export const DIVISIONS = [
  1 / 4,
  1 / 3,
  1 / 2,
  2 / 3,
  3 / 4,
  1,
  4 / 3,
  3 / 2,
  2,
  3,
  4,
  5,
  6,
  8,
  10,
  12,
  16,
  20,
  24,
  32,
  48,
  64,
];

export function snapDivision(raw: number, tol: number): number | null {
  if (!(raw > 0)) return null;
  for (const d of DIVISIONS) if (Math.abs(raw / d - 1) <= tol) return d;
  return null;
}

const GRID: Array<[number, number]> = [
  [4, 7],
  [2, 6],
  [1, 5],
  [1 / 2, 4],
  [1 / 3, 3.5],
  [1 / 4, 3],
  [1 / 6, 2.5],
  [1 / 8, 2],
  [1 / 12, 1.5],
  [1 / 16, 1],
  [1 / 24, 0.5],
  [1 / 32, 0.25],
];

export function metricWeight(beatPos: number): number {
  for (const [g, w] of GRID) {
    const q = beatPos / g;
    if (Math.abs(q - Math.round(q)) * g <= Math.min(0.01, g * 0.15)) return w;
  }
  return 0;
}

/** "N비트" in Korean rhythm-game terms: 4 × notes per beat. */
export function divisionLabel(division: number | null, raw?: number): string {
  if (division == null) return raw && raw > 0 ? `비정형(${(raw * 4).toFixed(1)}비트)` : '단타';
  const beat = division * 4;
  if (Number.isInteger(beat)) return `${beat}비트`;
  return `${(1 / division).toFixed(2).replace(/\.?0+$/, '')}박 간격`;
}

/**
 * Degrees the planet turns between each pair of consecutive notes (pauses and holds included).
 * NaN when the tile data is not available.
 */
export function rotationsBetweenNotes(timing: Pick<Timing, 'tiles' | 'notes'>): Float64Array {
  const { notes, tiles } = timing;
  const out = new Float64Array(Math.max(0, notes.length - 1));
  for (let i = 0; i + 1 < notes.length; i++) {
    let deg = 0;
    for (let f = notes[i]!.floor; f < notes[i + 1]!.floor; f++) {
      const t = tiles[f];
      if (!t) {
        deg = Number.NaN;
        break;
      }
      deg += t.rotation + t.pauseBeats * 180 + t.holdTurns * 360;
    }
    out[i] = deg;
  }
  return out;
}

/**
 * Find 90° doubles inside streams: two single notes turning at most 90° whose gap is at most 0.6×
 * the stream around them (the median of the two gaps before and after) and clearly shorter than
 * both neighbouring gaps. In a straight 질주 a 90° tile is usually paired with a 270° one, so the
 * neighbours need not be equal. The stream must be at least `minBeat` 비트. Each pair becomes one
 * spread group: one hand plays both, they keep their own times, and the group moves at the
 * stream's speed.
 */
function mergeStreamDoubles(
  chords: Array<[number, number]>,
  times: ArrayLike<number>,
  turn: ArrayLike<number>,
  sections: BeatSection[],
  minBeat: number,
): Array<[number, number, boolean, number]> {
  const out: Array<[number, number, boolean, number]> = [];
  const baseAt = (t: number) => {
    let bpm = sections[0]!.bpm;
    for (const s of sections) if (s.startTime <= t + 1e-6) bpm = s.bpm;
    return bpm;
  };
  const start = (j: number) => times[chords[j]![0]]!;
  const end = (j: number) => times[chords[j]![0] + chords[j]![1] - 1]!;
  for (let j = 0; j < chords.length; j++) {
    const [first, count] = chords[j]!;
    const next = chords[j + 1];
    if (minBeat > 0 && count === 1 && next && next[1] === 1 && j > 0 && j + 2 < chords.length) {
      const a = first;
      const b = next[0];
      const g = times[b]! - times[a]!;
      const gp = times[a]! - end(j - 1);
      const gn = start(j + 2) - times[b]!;
      const around = [gp, gn];
      if (j > 1) around.push(start(j - 1) - end(j - 2));
      if (j + 3 < chords.length) around.push(start(j + 3) - end(j + 2));
      around.sort((x, y) => x - y);
      const stream =
        around.length % 2
          ? around[around.length >> 1]!
          : (around[around.length / 2 - 1]! + around[around.length / 2]!) / 2;
      const streamBeat = (4 * (60 / stream)) / baseAt(times[a]!);
      if (
        turn[a]! <= 90 + 1e-6 &&
        g > 0 &&
        g <= 0.6 * stream &&
        gp >= 1.5 * g &&
        gn >= 1.5 * g &&
        streamBeat >= minBeat * 0.97
      ) {
        out.push([a, 2, true, stream]);
        j++;
        continue;
      }
    }
    out.push([first, count, false, 0]);
  }
  return out;
}

export function analyzeRhythm(
  timing: Timing,
  sections: BeatSection[],
  options: Partial<RhythmOptions> = {},
): RhythmAnalysis {
  const opts = { ...DEFAULT_RHYTHM_OPTIONS, ...options };
  const notes = timing.notes;
  const turn = rotationsBetweenNotes(timing);
  const sharp = new Uint8Array(turn.length);
  if (opts.oneHandAngle > 0) {
    for (let i = 0; i < turn.length; i++) {
      const gap = (notes[i + 1]!.time - notes[i]!.time) * 1000;
      sharp[i] = turn[i]! <= opts.oneHandAngle + 1e-6 && gap <= opts.oneHandMaxMs ? 1 : 0;
    }
  }
  const chords = groupChords(
    timing.noteTimes,
    {
      thresholdMs: opts.chordThresholdMs,
      maxSize: opts.chordMaxSize,
      isolation: opts.chordIsolation,
      forcedIsolation: 1.8,
    },
    sharp,
  );
  const noteEvent = new Int32Array(notes.length);
  const secs = sections.length ? sections : [{ startFloor: 0, startTime: notes[0]?.time ?? 0, bpm: 120 }];
  const groups = mergeStreamDoubles(chords, timing.noteTimes, turn, secs, opts.streamDoubleMinBeat);

  const events: RhythmEvent[] = [];
  let si = 0;
  const streamGapOf = new Map<number, number>();
  for (const [first, count, spread, streamGap] of groups) {
    if (spread) streamGapOf.set(events.length, streamGap);
    const note = notes[first]!;
    while (si + 1 < secs.length && secs[si + 1]!.startTime <= note.time + 1e-6) si++;
    const sec = secs[si]!;
    const beatPos = ((note.time - sec.startTime) * sec.bpm) / 60;
    for (let k = 0; k < count; k++) noteEvent[first + k] = events.length;
    let oneHand = count > 1;
    if (!spread) for (let k = first; k < first + count - 1; k++) if (!sharp[k]) oneHand = false;
    events.push({
      index: events.length,
      firstNote: first,
      noteCount: count,
      oneHand,
      spread,
      time: note.time,
      endTime: spread ? notes[first + count - 1]!.time : note.time,
      floor: note.floor,
      section: si,
      baseBpm: sec.bpm,
      beatPos,
      metric: metricWeight(beatPos),
      gapPrev: Infinity,
      gapNext: Infinity,
      speedGap: Infinity,
      effBpm: 0,
      division: null,
      divisionRaw: 0,
      run: 0,
    });
  }

  for (let e = 0; e < events.length; e++) {
    const ev = events[e]!;
    if (e > 0) ev.gapPrev = ev.time - events[e - 1]!.endTime;
    if (e + 1 < events.length) ev.gapNext = events[e + 1]!.time - ev.endTime;
    // a stream double moves at the speed of the stream around it
    ev.speedGap = ev.spread ? streamGapOf.get(e)! : Math.min(ev.gapPrev, ev.gapNext);
    if (Number.isFinite(ev.speedGap) && ev.speedGap > 0) {
      ev.effBpm = 60 / ev.speedGap;
      ev.divisionRaw = ev.effBpm / ev.baseBpm;
      ev.division = snapDivision(ev.divisionRaw, opts.snapTolerance);
    }
  }

  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const ev of events) {
    // Next to a stream double the gap can be up to 1.5× the stream (the 270° half of a 90°/270°
    // pair) without the stream really stopping.
    const nearDouble = ev.spread || (ev.index > 0 && events[ev.index - 1]!.spread);
    const gapFits = (gap: number, speed: number) =>
      approxRel(gap, speed, opts.runTolerance) || (nearDouble && gap >= speed * 0.9 && gap <= speed * 1.65);
    const joins =
      cur !== null &&
      approxRel(ev.speedGap, cur.speedGap, opts.runTolerance) &&
      gapFits(ev.gapPrev, cur.speedGap);
    if (cur && joins) {
      cur.lastEvent = ev.index;
      cur.eventCount++;
      cur.noteCount += ev.noteCount;
      cur.endTime = ev.time;
    } else {
      cur = {
        index: runs.length,
        firstEvent: ev.index,
        lastEvent: ev.index,
        eventCount: 1,
        noteCount: ev.noteCount,
        speedGap: ev.speedGap,
        effBpm: ev.effBpm,
        division: ev.division,
        divisionRaw: ev.divisionRaw,
        restBefore: ev.gapPrev,
        startTime: ev.time,
        endTime: ev.time,
        section: ev.section,
        baseBpm: ev.baseBpm,
      };
      runs.push(cur);
    }
    ev.run = cur.index;
  }

  return { events, runs, sections: secs, noteEvent, noteTimes: timing.noteTimes, options: opts };
}
