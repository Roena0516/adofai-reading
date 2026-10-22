export interface ChordOptions {
  /** Notes closer than this (ms) may form a pseudo chord (따닥/동타). */
  thresholdMs: number;
  /** Larger clusters are treated as fast streams instead. */
  maxSize: number;
  /** Gaps around a chord must be at least this many times its largest inner gap. */
  isolation: number;
  /** Looser isolation for clusters made only of forced (sharp-turn) gaps; the chart already says "double". */
  forcedIsolation?: number;
}

/**
 * Group sorted note times into chords. A cluster only counts as a chord when it is small and
 * clearly separated from its neighbours; otherwise it is split at its widest gap and retried,
 * so a 5 ms pseudo inside a 37 ms stream is still found.
 * `forced[i]` marks gap i (between note i and i+1) as a chord candidate regardless of its
 * length, e.g. a sharp 30° turn the chart author meant as a one-hand double.
 * Returns [firstIndex, count] pairs that cover every note in order.
 */
export function groupChords(
  times: ArrayLike<number>,
  opts: ChordOptions,
  forced?: ArrayLike<number>,
): Array<[number, number]> {
  const n = times.length;
  const gap = (i: number) => times[i + 1]! - times[i]!;
  const isChord = new Uint8Array(Math.max(0, n - 1));
  const threshold = opts.thresholdMs / 1000;

  // [lo, hi, threshold, useForced]; forced gaps only count on the first pass so splitting ends.
  const stack: Array<[number, number, number, boolean]> = [[0, n - 1, threshold, true]];
  while (stack.length) {
    const [lo, hi, thr, useForced] = stack.pop()!;
    const candidate = (i: number) => gap(i) <= thr || (useForced && !!forced?.[i]);
    let i = lo;
    while (i < hi) {
      if (!candidate(i)) {
        i++;
        continue;
      }
      let j = i;
      let maxInner = 0;
      let allForced = useForced;
      while (j < hi && candidate(j)) {
        maxInner = Math.max(maxInner, gap(j));
        if (!forced?.[j]) allForced = false;
        j++;
      }
      const size = j - i + 1;
      const before = i > 0 ? gap(i - 1) : Infinity;
      const after = j < n - 1 ? gap(j) : Infinity;
      const iso = allForced
        ? Math.min(opts.isolation, opts.forcedIsolation ?? opts.isolation)
        : opts.isolation;
      const isolated = Math.min(before, after) >= iso * maxInner;
      if (size <= opts.maxSize && isolated) {
        for (let k = i; k < j; k++) isChord[k] = 1;
      } else if (maxInner > 0 && size > 2) {
        stack.push([i, j, maxInner * 0.999, false]);
      }
      i = j;
    }
  }

  const out: Array<[number, number]> = [];
  let k = 0;
  while (k < n) {
    let end = k;
    while (end < n - 1 && isChord[end]) end++;
    out.push([k, end - k + 1]);
    k = end + 1;
  }
  return out;
}
