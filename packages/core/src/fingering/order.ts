import type { Lane } from './layout';
import { laneLabel } from './layout';

export interface ParsedOrder {
  /** 0-based lane indices. */
  seq: number[];
  error: string | null;
}

/**
 * Parse a cyclic order such as "3421" or "56784321" (1-based lanes, keyboard order).
 * Without separators every character is one lane and "0" means lane 10;
 * with spaces or commas multi-digit lanes are allowed ("1,2,10,11").
 */
export function parseOrder(text: string, laneCount: number): ParsedOrder {
  const t = text.trim();
  if (!t) return { seq: [], error: '순서가 비어 있습니다.' };
  const tokens = /[\s,]/.test(t) ? t.split(/[\s,]+/).filter(Boolean) : [...t];
  const seq: number[] = [];
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) return { seq: [], error: `"${tok}"는 레인 번호가 아닙니다.` };
    const v = tok === '0' ? 10 : parseInt(tok, 10);
    if (v < 1 || v > laneCount) return { seq: [], error: `${v}번 레인이 없습니다 (1~${laneCount}).` };
    seq.push(v - 1);
  }
  return { seq, error: null };
}

export function formatOrder(seq: number[]): string {
  return seq.some((x) => x >= 9) ? seq.map((x) => x + 1).join(',') : seq.map((x) => x + 1).join('');
}

/** "R검 → R중 → L검 → L중" */
export function describeOrder(seq: number[], lanes: Lane[]): string {
  return seq.map((i) => (lanes[i] ? laneLabel(lanes[i]) : '?')).join(' → ');
}

/** Rewrite an order for a different lane layout, matching lanes by hand and finger (unknown lanes are dropped). */
export function remapOrder(order: string, from: Lane[], to: Lane[]): string {
  const parsed = parseOrder(order, from.length);
  if (parsed.error) return order;
  const out: number[] = [];
  for (const i of parsed.seq) {
    const src = from[i]!;
    const j = to.findIndex((l) => l.hand === src.hand && l.finger === src.finger);
    if (j >= 0) out.push(j);
  }
  return out.length ? formatOrder(out) : order;
}
