import type { JudgeStats, RunScore } from '@adofai-reading/core';
import { create } from 'zustand';

interface PracticeStore {
  stats: JudgeStats | null;
  runScores: RunScore[];
  /** Bumped when a new practice pass starts so the canvas can reset its judge. */
  epoch: number;
  set: (patch: Partial<Omit<PracticeStore, 'set' | 'restart'>>) => void;
  restart: () => void;
}

export const usePractice = create<PracticeStore>()((set) => ({
  stats: null,
  runScores: [],
  epoch: 0,
  set: (patch) => set(patch),
  restart: () => set((s) => ({ epoch: s.epoch + 1, stats: null, runScores: [] })),
}));
