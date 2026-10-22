import type { ArchiveFile, Level, Timing } from '@adofai-reading/core';
import { create } from 'zustand';

export interface LoadedLevel {
  hash: string;
  levelPath: string;
  level: Level;
  timing: Timing;
  audioName: string | null;
  audioError: string | null;
  /** Other .adofai files in the same archive. */
  levelPaths: string[];
  archive: ArchiveFile[];
}

interface LevelStore {
  loaded: LoadedLevel | null;
  loading: boolean;
  error: string | null;
  set: (patch: Partial<Omit<LevelStore, 'set'>>) => void;
}

export const useLevel = create<LevelStore>()((set) => ({
  loaded: null,
  loading: false,
  error: null,
  set: (patch) => set(patch),
}));
