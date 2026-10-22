import type { Run, RhythmAnalysis } from '../rhythm/analyze';
import { JUDGE } from './judge';
import type { Judge } from './judge';

export interface LaneStats {
  lane: number;
  hits: number;
  meanMs: number;
  sdMs: number;
  wrong: number;
  miss: number;
}

export interface JudgeStats {
  /** Notes that have been judged (excluding auto/skipped). */
  judged: number;
  perfect: number;
  near: number;
  far: number;
  miss: number;
  wrong: number;
  /** 0..1 */
  accuracy: number;
  meanMs: number;
  sdMs: number;
  combo: number;
  maxCombo: number;
  lanes: LaneStats[];
}

const WEIGHT: Record<number, number> = {
  [JUDGE.perfect]: 1,
  [JUDGE.near]: 0.75,
  [JUDGE.far]: 0.4,
  [JUDGE.miss]: 0,
};

function meanSd(xs: number[]): [number, number] {
  if (!xs.length) return [0, 0];
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return [m, Math.sqrt(v)];
}

export function computeStats(
  judge: Judge,
  noteLane: ArrayLike<number>,
  laneCount: number,
  wrongIsMiss: boolean,
): JudgeStats {
  const s: JudgeStats = {
    judged: 0,
    perfect: 0,
    near: 0,
    far: 0,
    miss: 0,
    wrong: 0,
    accuracy: 0,
    meanMs: 0,
    sdMs: 0,
    combo: 0,
    maxCombo: 0,
    lanes: [],
  };
  const offsets: number[] = [];
  const laneOffsets: number[][] = Array.from({ length: laneCount }, () => []);
  const laneWrong = new Array<number>(laneCount).fill(0);
  const laneMiss = new Array<number>(laneCount).fill(0);
  let score = 0;
  let combo = 0;
  for (let i = 0; i < judge.noteCount; i++) {
    const code = judge.result[i]!;
    if (code === JUDGE.none || code === JUDGE.auto || code === JUDGE.skipped) continue;
    s.judged++;
    const lane = noteLane[i]!;
    if (code === JUDGE.miss) {
      s.miss++;
      if (lane < laneCount) laneMiss[lane]!++;
      combo = 0;
      continue;
    }
    const off = judge.offsetMs[i]!;
    offsets.push(off);
    if (code === JUDGE.wrong) {
      s.wrong++;
      if (lane < laneCount) laneWrong[lane]!++;
      score += wrongIsMiss ? 0 : 0.5;
      if (wrongIsMiss) combo = 0;
      else combo++;
    } else {
      if (code === JUDGE.perfect) s.perfect++;
      else if (code === JUDGE.near) s.near++;
      else s.far++;
      score += WEIGHT[code] ?? 0;
      if (lane < laneCount) laneOffsets[lane]!.push(off);
      combo++;
    }
    s.maxCombo = Math.max(s.maxCombo, combo);
  }
  s.combo = combo;
  s.accuracy = s.judged ? score / s.judged : 0;
  [s.meanMs, s.sdMs] = meanSd(offsets);
  s.lanes = laneOffsets.map((xs, lane) => {
    const [meanMs, sdMs] = meanSd(xs);
    return { lane, hits: xs.length, meanMs, sdMs, wrong: laneWrong[lane]!, miss: laneMiss[lane]! };
  });
  return s;
}

export interface RunScore {
  run: Run;
  judged: number;
  accuracy: number;
  wrong: number;
  miss: number;
}

/** Per-run accuracy, for finding the stretches that need practice. */
export function runScores(judge: Judge, analysis: RhythmAnalysis, wrongIsMiss: boolean): RunScore[] {
  const out: RunScore[] = [];
  for (const run of analysis.runs) {
    let judged = 0;
    let score = 0;
    let wrong = 0;
    let miss = 0;
    for (let e = run.firstEvent; e <= run.lastEvent; e++) {
      const ev = analysis.events[e]!;
      for (let k = 0; k < ev.noteCount; k++) {
        const code = judge.result[ev.firstNote + k]!;
        if (code === JUDGE.none || code === JUDGE.auto || code === JUDGE.skipped) continue;
        judged++;
        if (code === JUDGE.miss) miss++;
        else if (code === JUDGE.wrong) {
          wrong++;
          score += wrongIsMiss ? 0 : 0.5;
        } else score += WEIGHT[code] ?? 0;
      }
    }
    if (judged) out.push({ run, judged, accuracy: score / judged, wrong, miss });
  }
  return out;
}
