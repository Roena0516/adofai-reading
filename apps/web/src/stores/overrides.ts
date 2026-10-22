import type { BaseSwitch, RangeOverride, SectionEdit } from '@adofai-reading/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LevelOverrides {
  /** null = use automatic detection. */
  sections: SectionEdit[] | null;
  ranges: RangeOverride[];
  notes: Record<string, number>;
  /** "이 구간부터 n키 기반" switches, sorted by floor. */
  bases: BaseSwitch[];
}

export const EMPTY_OVERRIDES: LevelOverrides = { sections: null, ranges: [], notes: {}, bases: [] };

interface OverridesStore {
  byLevel: Record<string, LevelOverrides>;
  patch: (hash: string, fn: (o: LevelOverrides) => LevelOverrides) => void;
}

export const useOverrides = create<OverridesStore>()(
  persist(
    (set) => ({
      byLevel: {},
      patch: (hash, fn) =>
        set((s) => ({ byLevel: { ...s.byLevel, [hash]: fn(s.byLevel[hash] ?? EMPTY_OVERRIDES) } })),
    }),
    {
      name: 'adofai-reading:overrides',
      version: 2,
      // v2 adds the base switches to every level
      migrate: (state, version) => {
        const s = state as { byLevel?: Record<string, Partial<LevelOverrides>> };
        if (version < 2 && s.byLevel)
          for (const [k, v] of Object.entries(s.byLevel)) s.byLevel[k] = { ...EMPTY_OVERRIDES, ...v };
        return s as OverridesStore;
      },
    },
  ),
);

export function useLevelOverrides(hash: string | undefined): LevelOverrides {
  return useOverrides((s) => (hash ? s.byLevel[hash] : undefined) ?? EMPTY_OVERRIDES);
}

let rangeCounter = 0;
export function newRangeId(): string {
  rangeCounter++;
  return `r${Date.now().toString(36)}${rangeCounter}`;
}

/** Set the base from a floor on: replaces a switch at that floor, and drops it when it changes nothing. */
export function setBaseFrom(
  o: LevelOverrides,
  floor: number,
  base: 2 | 4,
  profileBase: 2 | 4,
): LevelOverrides {
  const rest = o.bases.filter((b) => b.floor !== floor);
  const before = rest.filter((b) => b.floor < floor).at(-1)?.base ?? profileBase;
  const bases = before === base ? rest : [...rest, { floor, base }];
  return { ...o, bases: bases.sort((a, b) => a.floor - b.floor) };
}
