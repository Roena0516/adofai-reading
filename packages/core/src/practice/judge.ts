export const JUDGE = {
  none: 0,
  perfect: 1,
  near: 2,
  far: 3,
  miss: 4,
  wrong: 5,
  auto: 6,
  skipped: 7,
} as const;
export type JudgeCode = (typeof JUDGE)[keyof typeof JUDGE];

export const JUDGE_LABEL: Record<JudgeCode, string> = {
  0: '',
  1: '완벽',
  2: '근접',
  3: '원거리',
  4: '미스',
  5: '손가락 틀림',
  6: '오토',
  7: '',
};

export interface JudgeWindows {
  perfectMs: number;
  nearMs: number;
  farMs: number;
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
 * Lane-aware judge. A press matches the earliest unjudged note in the same lane inside the far
 * window. If no note in that lane is close enough but a note in another lane is, that note is
 * consumed as "wrong finger" so timing practice still counts while the error is visible.
 */
export class Judge {
  readonly result: Uint8Array;
  readonly offsetMs: Float32Array;
  readonly pressedLane: Int16Array;
  private head = 0;

  constructor(
    private readonly times: ArrayLike<number>,
    private readonly lanes: ArrayLike<number>,
    private readonly auto: ArrayLike<number | boolean>,
    private windows: JudgeWindows,
  ) {
    const n = times.length;
    this.result = new Uint8Array(n);
    this.offsetMs = new Float32Array(n);
    this.pressedLane = new Int16Array(n).fill(-1);
  }

  get noteCount(): number {
    return this.times.length;
  }

  setWindows(w: JudgeWindows): void {
    this.windows = w;
  }

  /** Forget all results and ignore notes that are already past `fromTime`. */
  reset(fromTime: number): void {
    this.result.fill(JUDGE.none);
    this.offsetMs.fill(0);
    this.pressedLane.fill(-1);
    const cutoff = fromTime - this.windows.farMs / 1000;
    let i = 0;
    while (i < this.times.length && this.times[i]! < cutoff) {
      this.result[i] = JUDGE.skipped;
      i++;
    }
    this.head = i;
  }

  private codeFor(offsetMs: number): JudgeCode {
    const a = Math.abs(offsetMs);
    if (a <= this.windows.perfectMs) return JUDGE.perfect;
    if (a <= this.windows.nearMs) return JUDGE.near;
    return JUDGE.far;
  }

  press(lane: number, t: number): JudgeHit | null {
    const far = this.windows.farMs / 1000;
    while (this.head < this.times.length && this.result[this.head] !== JUDGE.none) this.head++;
    let same = -1;
    let other = -1;
    for (let i = this.head; i < this.times.length && this.times[i]! <= t + far; i++) {
      if (this.result[i] !== JUDGE.none || this.auto[i]) continue;
      if (t - this.times[i]! > far) continue;
      if (this.lanes[i] === lane) {
        same = i;
        break;
      }
      if (other < 0) other = i;
    }
    const i = same >= 0 ? same : other;
    if (i < 0) return null;
    const offsetMs = (t - this.times[i]!) * 1000;
    const code = same >= 0 ? this.codeFor(offsetMs) : JUDGE.wrong;
    this.result[i] = code;
    this.offsetMs[i] = offsetMs;
    this.pressedLane[i] = lane;
    return { note: i, code, offsetMs, lane, expectedLane: this.lanes[i]! };
  }

  /** Mark notes that can no longer be hit at time t; returns the new misses. */
  update(t: number): JudgeHit[] {
    const far = this.windows.farMs / 1000;
    const out: JudgeHit[] = [];
    let i = this.head;
    while (i < this.times.length && this.times[i]! < t - far) {
      if (this.result[i] === JUDGE.none) {
        if (this.auto[i]) {
          this.result[i] = JUDGE.auto;
        } else {
          this.result[i] = JUDGE.miss;
          out.push({ note: i, code: JUDGE.miss, offsetMs: 0, lane: -1, expectedLane: this.lanes[i]! });
        }
      }
      i++;
    }
    // Auto notes are "played" as soon as their time arrives.
    for (let k = i; k < this.times.length && this.times[k]! <= t; k++) {
      if (this.result[k] === JUDGE.none && this.auto[k]) this.result[k] = JUDGE.auto;
    }
    return out;
  }
}
