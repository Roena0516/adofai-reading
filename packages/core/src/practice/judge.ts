export const JUDGE = {
  none: 0,
  perfect: 1,
  near: 2,
  far: 3,
  miss: 4,
  wrong: 5,
  auto: 6,
  skipped: 7,
  /** A press before any note's window (the game's "Too Early"): shown, but nothing is consumed. */
  tooEarly: 8,
} as const;
export type JudgeCode = (typeof JUDGE)[keyof typeof JUDGE];

export const JUDGE_LABEL: Record<JudgeCode, string> = {
  0: '',
  1: '완벽',
  2: '빠름·느림',
  3: '빠름·느림',
  4: '미스',
  5: '손가락 틀림',
  6: '오토',
  7: '',
  8: '너무 빠름',
};

/**
 * The judgment with its side. Like the game, near (E/L Perfect) and far (Early / Late) share the words
 * 빠름 / 느림 and differ only in colour: yellow and red.
 */
export function judgeLabel(code: JudgeCode, offsetMs: number): string {
  if (code === JUDGE.near || code === JUDGE.far) return offsetMs < 0 ? '빠름' : '느림';
  return JUDGE_LABEL[code];
}

export interface JudgeWindows {
  perfectMs: number;
  nearMs: number;
  farMs: number;
}

/** Windows per note, in ms either side (they depend on each note's BPM in the game). */
export interface NoteWindows {
  perfect: ArrayLike<number>;
  near: ArrayLike<number>;
  far: ArrayLike<number>;
}

/** The game's timing option. */
export type JudgeStrictness = 'lenient' | 'normal' | 'strict';

/**
 * Narrowest windows (s) for Perfect, E/L Perfect and Early/Late per timing option. The game judges by
 * angle (±30°, ±45°, ±60° of the planet's turn) but never narrower than these: the Early/Late edge stops
 * shrinking at 0.091 / 0.065 / 0.04 s (about 220 / 310 / 500 BPM) and Perfect at half of it, at least
 * 25 ms. The E/L Perfect floor (¾ of Early/Late, at least 30 ms) is our estimate.
 */
export const MIN_WINDOWS: Record<JudgeStrictness, [number, number, number]> = {
  lenient: [0.0455, 0.06825, 0.091],
  normal: [0.0325, 0.04875, 0.065],
  strict: [0.025, 0.03, 0.04],
};

/**
 * The game's windows for notes led into at these BPMs: the planet turns 180° per beat, so an angle
 * θ is θ / (3 × BPM) seconds; each edge is that or the option's floor, whichever is wider.
 */
export function adofaiWindows(bpms: ArrayLike<number>, strictness: JudgeStrictness): NoteWindows {
  const n = bpms.length;
  const [p, nr, f] = MIN_WINDOWS[strictness];
  const out = { perfect: new Float32Array(n), near: new Float32Array(n), far: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const degPerSec = 3 * Math.max(1e-6, bpms[i]!);
    out.perfect[i] = Math.max(30 / degPerSec, p) * 1000;
    out.near[i] = Math.max(45 / degPerSec, nr) * 1000;
    out.far[i] = Math.max(60 / degPerSec, f) * 1000;
  }
  return out;
}

/** The same windows for every note. */
export function fixedWindows(n: number, w: JudgeWindows): NoteWindows {
  return {
    perfect: new Float32Array(n).fill(w.perfectMs),
    near: new Float32Array(n).fill(w.nearMs),
    far: new Float32Array(n).fill(w.farMs),
  };
}

export interface JudgeHit {
  note: number;
  code: JudgeCode;
  /** Positive = late. */
  offsetMs: number;
  /** Lane that was pressed (-1 for misses). */
  lane: number;
  expectedLane: number;
}

/**
 * Lane-aware judge. A press matches the earliest unjudged note in the same lane inside its far
 * window. If no note in that lane is close enough but a note in another lane is, that note is
 * consumed as "wrong finger" so timing practice still counts while the error is visible. A press
 * before every window is "too early" and consumes nothing, like the game.
 */
export class Judge {
  readonly result: Uint8Array;
  readonly offsetMs: Float32Array;
  readonly pressedLane: Int16Array;
  /** Song time each note was judged at (the press, or when it became a miss); NaN while open. */
  readonly judgedAt: Float64Array;
  /** The latest too-early press: song time and the note it was too early for (-1: none yet). */
  tooEarly = { at: Number.NaN, note: -1 };
  private head = 0;
  /** Widest and narrowest far window (s), to bound the scans. */
  private maxFar = 0;
  private minFar = 0;

  constructor(
    private readonly times: ArrayLike<number>,
    private readonly lanes: ArrayLike<number>,
    private readonly auto: ArrayLike<number | boolean>,
    private windows: NoteWindows,
  ) {
    const n = times.length;
    this.result = new Uint8Array(n);
    this.offsetMs = new Float32Array(n);
    this.pressedLane = new Int16Array(n).fill(-1);
    this.judgedAt = new Float64Array(n).fill(Number.NaN);
    this.bound();
  }

  /** The first note not judged yet (notes.length when all are). */
  pending(): number {
    while (this.head < this.times.length && this.result[this.head] !== JUDGE.none) this.head++;
    return this.head;
  }

  private bound(): void {
    let lo = Infinity;
    let hi = 0;
    for (let i = 0; i < this.times.length; i++) {
      lo = Math.min(lo, this.windows.far[i]!);
      hi = Math.max(hi, this.windows.far[i]!);
    }
    this.minFar = Number.isFinite(lo) ? lo / 1000 : 0;
    this.maxFar = hi / 1000;
  }

  get noteCount(): number {
    return this.times.length;
  }

  setWindows(w: NoteWindows): void {
    this.windows = w;
    this.bound();
  }

  /** Forget all results and ignore notes that are already past `fromTime`. */
  reset(fromTime: number): void {
    this.result.fill(JUDGE.none);
    this.offsetMs.fill(0);
    this.pressedLane.fill(-1);
    this.judgedAt.fill(Number.NaN);
    this.tooEarly = { at: Number.NaN, note: -1 };
    let i = 0;
    while (i < this.times.length && this.times[i]! < fromTime - this.windows.far[i]! / 1000) {
      this.result[i] = JUDGE.skipped;
      i++;
    }
    this.head = i;
  }

  private codeFor(i: number, offsetMs: number): JudgeCode {
    const a = Math.abs(offsetMs);
    if (a <= this.windows.perfect[i]!) return JUDGE.perfect;
    if (a <= this.windows.near[i]!) return JUDGE.near;
    return JUDGE.far;
  }

  press(lane: number, t: number): JudgeHit | null {
    while (this.head < this.times.length && this.result[this.head] !== JUDGE.none) this.head++;
    let same = -1;
    let other = -1;
    let next = -1;
    for (let i = this.head; i < this.times.length && this.times[i]! <= t + this.maxFar; i++) {
      if (this.result[i] !== JUDGE.none || this.auto[i]) continue;
      const far = this.windows.far[i]! / 1000;
      if (t - this.times[i]! > far) continue;
      if (this.times[i]! - t > far) {
        if (next < 0) next = i;
        continue;
      }
      if (this.lanes[i] === lane) {
        same = i;
        break;
      }
      if (other < 0) other = i;
    }
    const i = same >= 0 ? same : other;
    if (i < 0) {
      // nothing in reach: the game's "too early" if a note is still to come
      let k = next;
      for (let j = this.head; k < 0 && j < this.times.length; j++)
        if (this.result[j] === JUDGE.none && !this.auto[j] && this.times[j]! > t) k = j;
      if (k < 0) return null;
      this.tooEarly = { at: t, note: k };
      return {
        note: k,
        code: JUDGE.tooEarly,
        offsetMs: (t - this.times[k]!) * 1000,
        lane,
        expectedLane: this.lanes[k]!,
      };
    }
    const offsetMs = (t - this.times[i]!) * 1000;
    const code = same >= 0 ? this.codeFor(i, offsetMs) : JUDGE.wrong;
    this.result[i] = code;
    this.offsetMs[i] = offsetMs;
    this.pressedLane[i] = lane;
    this.judgedAt[i] = t;
    return { note: i, code, offsetMs, lane, expectedLane: this.lanes[i]! };
  }

  /** Mark notes that can no longer be hit at time t; returns the new misses. */
  update(t: number): JudgeHit[] {
    const out: JudgeHit[] = [];
    // notes past their own far window, scanning up to the narrowest window
    for (let i = this.head; i < this.times.length && this.times[i]! < t - this.minFar; i++) {
      if (this.times[i]! >= t - this.windows.far[i]! / 1000) continue;
      if (this.result[i] === JUDGE.none) {
        if (this.auto[i]) {
          this.result[i] = JUDGE.auto;
        } else {
          this.result[i] = JUDGE.miss;
          this.judgedAt[i] = this.times[i]! + this.windows.far[i]! / 1000;
          out.push({ note: i, code: JUDGE.miss, offsetMs: 0, lane: -1, expectedLane: this.lanes[i]! });
        }
      }
    }
    // Auto notes are "played" as soon as their time arrives.
    for (let k = this.head; k < this.times.length && this.times[k]! <= t; k++) {
      if (this.result[k] === JUDGE.none && this.auto[k]) this.result[k] = JUDGE.auto;
    }
    return out;
  }
}
