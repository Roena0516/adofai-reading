import type {
  BeatSection,
  FingeringProfile,
  FingeringResult,
  Lane,
  RhythmAnalysis,
  Timing,
  Track,
  TrackEffects,
} from '@adofai-reading/core';
import {
  analyzeRhythm,
  assignFingering,
  buildTrackEffects,
  computeTrack,
  detectSections,
  resolveSections,
} from '@adofai-reading/core';
import { createContext, useContext, useMemo } from 'react';
import { useLevel } from '../stores/level';
import type { LoadedLevel } from '../stores/level';
import { useLevelOverrides } from '../stores/overrides';
import { useActiveProfile } from '../stores/profiles';
import { useSettings } from '../stores/settings';

export interface ChartModel {
  loaded: LoadedLevel;
  timing: Timing;
  sections: BeatSection[];
  detectedSections: BeatSection[];
  sectionsEdited: boolean;
  analysis: RhythmAnalysis;
  fingering: FingeringResult;
  profile: FingeringProfile;
  lanes: Lane[];
  noteFloors: Int32Array;
  noteAuto: Uint8Array;
  track: Track;
  effects: TrackEffects;
  /** Note times as drawn and judged: chords collapse onto their first note in "together" mode. */
  displayTimes: Float64Array;
}

export const ChartContext = createContext<ChartModel | null>(null);

export function useChart(): ChartModel {
  const m = useContext(ChartContext);
  if (!m) throw new Error('ChartContext missing');
  return m;
}

export function useChartModel(): ChartModel | null {
  const loaded = useLevel((s) => s.loaded);
  const profile = useActiveProfile();
  const overrides = useLevelOverrides(loaded?.hash);
  const chordDisplay = useSettings((s) => s.chordDisplay);

  const detectedSections = useMemo(() => (loaded ? detectSections(loaded.timing) : []), [loaded]);
  const sections = useMemo(() => {
    if (!loaded) return [];
    if (overrides.sections?.length) {
      const resolved = resolveSections(overrides.sections, loaded.timing.tiles);
      if (resolved.length) return resolved;
    }
    return detectedSections;
  }, [loaded, overrides.sections, detectedSections]);

  const { thresholdMs, maxSize, oneHandAngle, oneHandMaxMs, streamDouble, streamDoubleMinBeat } =
    profile.chord;
  const streamMin = streamDouble ? streamDoubleMinBeat : 0;
  const analysis = useMemo(
    () =>
      loaded
        ? analyzeRhythm(loaded.timing, sections, {
            chordThresholdMs: thresholdMs,
            chordMaxSize: maxSize,
            oneHandAngle,
            oneHandMaxMs,
            streamDoubleMinBeat: streamMin,
          })
        : null,
    [loaded, sections, thresholdMs, maxSize, oneHandAngle, oneHandMaxMs, streamMin],
  );
  const track = useMemo(
    () => computeTrack(loaded?.level.angles ?? [], loaded?.level.actionsByFloor),
    [loaded],
  );
  const effects = useMemo(() => (loaded ? buildTrackEffects(loaded.level, loaded.timing) : null), [loaded]);
  const noteFloors = useMemo(() => Int32Array.from(loaded?.timing.notes ?? [], (n) => n.floor), [loaded]);
  const noteAuto = useMemo(
    () => Uint8Array.from(loaded?.timing.notes ?? [], (n) => (n.autoplay ? 1 : 0)),
    [loaded],
  );
  const displayTimes = useMemo(() => {
    if (!loaded || !analysis) return new Float64Array(0);
    if (chordDisplay !== 'together') return loaded.timing.noteTimes;
    const out = Float64Array.from(loaded.timing.noteTimes);
    // 90° stream doubles keep their real times: they are two notes, just played by one hand
    for (const ev of analysis.events) {
      if (ev.spread) continue;
      for (let k = 1; k < ev.noteCount; k++) out[ev.firstNote + k] = ev.time;
    }
    return out;
  }, [loaded, analysis, chordDisplay]);

  const fingering = useMemo(
    () =>
      analysis
        ? assignFingering(analysis, noteFloors, profile, {
            ranges: overrides.ranges,
            notes: overrides.notes,
            bases: overrides.bases ?? [],
          })
        : null,
    [analysis, noteFloors, profile, overrides.ranges, overrides.notes, overrides.bases],
  );

  return useMemo(() => {
    if (!loaded || !analysis || !fingering || !effects) return null;
    return {
      loaded,
      timing: loaded.timing,
      sections,
      detectedSections,
      sectionsEdited: !!overrides.sections?.length,
      analysis,
      fingering,
      profile,
      lanes: fingering.lanes,
      noteFloors,
      noteAuto,
      track,
      effects,
      displayTimes,
    };
  }, [
    loaded,
    analysis,
    fingering,
    sections,
    detectedSections,
    overrides.sections,
    profile,
    noteFloors,
    noteAuto,
    track,
    effects,
    displayTimes,
  ]);
}
