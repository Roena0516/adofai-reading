import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Mode = 'view' | 'practice';
export type NoteLabel = 'lane' | 'finger' | 'none';

export interface Settings {
  mode: Mode;
  /** Pixels per second of song time. */
  scrollSpeed: number;
  direction: 'down' | 'up';
  laneWidth: number;
  noteHeight: number;
  noteLabel: NoteLabel;
  showRunLabels: boolean;
  showBeatLines: boolean;
  /** Playback speed relative to the level's own pitch. */
  rate: number;
  musicVolume: number;
  hitVolume: number;
  metroVolume: number;
  /** View mode: tick on every note. Practice mode: guide ticks. */
  noteSounds: boolean;
  guideSounds: boolean;
  pressSounds: boolean;
  metronome: boolean;
  /** Positive = notes drawn later (use when visuals look early). */
  visualOffsetMs: number;
  /** Positive = presses are treated as earlier (use when you are judged late). */
  inputOffsetMs: number;
  /** Seconds of run-up before a seek target in practice. */
  leadIn: number;
  sidebarTab: 'profile' | 'sections' | 'stats' | 'settings';
  sidebarOpen: boolean;
  /** Show the in-game style track next to the lanes. */
  showTrack: boolean;
  /** Extra zoom on top of the level's camera zoom, in percent. */
  trackScale: number;
  trackLabels: boolean;
  /** Tile colours: the level's own track colours, or the finger that plays each tile. */
  trackColorMode: 'level' | 'finger';
  /** Apply MoveCamera / MoveTrack / AnimateTrack like the game. */
  trackEffects: boolean;
  /** Backgrounds, flashes, screen shake and planet easing. */
  trackScreenFx: boolean;
  /** SetFilter and Bloom (WebGL). */
  trackFilters: boolean;
  /** Decoration images and text (off by default: they can hide the tiles). */
  trackDecorations: boolean;
  /** How quickly the camera catches up with the planet (1/s). */
  cameraFollow: number;
  /** Draw pseudo chords at their real (slightly staggered) times or all at the first note's time. */
  chordDisplay: 'actual' | 'together';
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'view',
  scrollSpeed: 1400,
  direction: 'down',
  laneWidth: 52,
  noteHeight: 12,
  noteLabel: 'lane',
  showRunLabels: true,
  showBeatLines: true,
  rate: 1,
  musicVolume: 0.8,
  hitVolume: 0.5,
  metroVolume: 0.4,
  noteSounds: true,
  guideSounds: false,
  pressSounds: true,
  metronome: false,
  visualOffsetMs: 0,
  inputOffsetMs: 0,
  leadIn: 2,
  sidebarTab: 'profile',
  sidebarOpen: true,
  showTrack: true,
  trackScale: 100,
  trackLabels: true,
  trackColorMode: 'level',
  trackEffects: true,
  trackScreenFx: true,
  trackFilters: true,
  trackDecorations: false,
  cameraFollow: 5,
  chordDisplay: 'actual',
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'adofai-reading:settings',
      version: 2,
      // v2: every layout shows 8 lanes, so the old 64 px default lane width becomes 52 px
      migrate: (state, version) => {
        const s = (state ?? {}) as Partial<Settings>;
        if (version < 2 && (s.laneWidth === undefined || s.laneWidth === 64)) s.laneWidth = 52;
        return s as SettingsStore;
      },
      merge: (p, c) => ({ ...c, ...(p as Partial<Settings>) }),
    },
  ),
);
