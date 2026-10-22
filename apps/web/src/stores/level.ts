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

/** One .adofai file offered when an upload holds several (difficulties of one song, for example). */
export interface LevelOption {
  path: string;
  song: string;
  artist: string;
  author: string;
  /** The level's own difficulty setting (1–10), if any. */
  difficulty: number | null;
  notes: number;
  bpm: number;
  /** Seconds from the first to the last note. */
  length: number;
  /** Why the file could not be read, if it could not. */
  error: string | null;
}

interface LevelStore {
  loaded: LoadedLevel | null;
  loading: boolean;
  error: string | null;
  /** Levels to choose from after an upload with several .adofai files. */
  choice: { archive: ArchiveFile[]; options: LevelOption[] } | null;
  set: (patch: Partial<Omit<LevelStore, 'set'>>) => void;
}

export const useLevel = create<LevelStore>()((set) => ({
  loaded: null,
  loading: false,
  error: null,
  choice: null,
  set: (patch) => set(patch),
}));
