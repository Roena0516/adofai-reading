import type { RangeOverride, SectionEdit } from '@adofai-reading/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LevelOverrides {
  /** null = use automatic detection. */
  sections: SectionEdit[] | null;
  ranges: RangeOverride[];
  notes: Record<string, number>;
}

export const EMPTY_OVERRIDES: LevelOverrides = { sections: null, ranges: [], notes: {} };

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
    { name: 'adofai-reading:overrides', version: 1 },
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
