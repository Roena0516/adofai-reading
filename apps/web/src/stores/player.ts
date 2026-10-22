import { create } from 'zustand';

interface PlayerStore {
  playing: boolean;
  /** Song time, refreshed ~10×/s for UI text (the canvas reads the engine directly). */
  time: number;
  loopA: number | null;
  loopB: number | null;
  loop: boolean;
  set: (patch: Partial<Omit<PlayerStore, 'set'>>) => void;
}

export const usePlayer = create<PlayerStore>()((set) => ({
  playing: false,
  time: 0,
  loopA: null,
  loopB: null,
  loop: false,
  set: (patch) => set(patch),
}));
