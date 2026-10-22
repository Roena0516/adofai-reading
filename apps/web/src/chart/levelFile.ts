import type { FingeringProfile } from '@adofai-reading/core';
import { laneLabel } from '@adofai-reading/core';
import { downloadJson, pickJsonFile } from '../lib/format';
import { EMPTY_OVERRIDES, useOverrides } from '../stores/overrides';
import type { LevelOverrides } from '../stores/overrides';
import type { ChartModel } from './model';

export const LEVEL_FILE_FORMAT = 'adofai-reading/level-fingering';

/** What a level's fingering file holds; import reads `overrides` (the profile is kept for reference). */
export interface LevelFingeringFile {
  format: typeof LEVEL_FILE_FORMAT;
  version: 1;
  level: { song: string; artist: string; author: string; hash: string };
  profile: FingeringProfile;
  overrides: LevelOverrides;
  /** Readable copy of the hand-made note edits: lane 1 = L소 … 8 = R소. */
  noteEdits: Array<{ floor: number; lane: number; finger: string }>;
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'level';

/** Download this level's edits (sections, ranges, dragged notes, base switches) and the profile as JSON. */
export function exportLevelFingering(model: ChartModel): void {
  const { loaded, lanes } = model;
  const ov = useOverrides.getState().byLevel[loaded.hash] ?? EMPTY_OVERRIDES;
  const s = loaded.level.settings;
  const noteEdits = Object.entries(ov.notes)
    .map(([floor, lane]) => ({
      floor: Number(floor),
      lane: lane + 1,
      finger: lanes[lane] ? laneLabel(lanes[lane]) : '?',
    }))
    .sort((a, b) => a.floor - b.floor);
  const file: LevelFingeringFile = {
    format: LEVEL_FILE_FORMAT,
    version: 1,
    level: { song: s.song, artist: s.artist, author: s.author, hash: loaded.hash },
    profile: model.profile,
    overrides: ov,
    noteEdits,
  };
  downloadJson(`${fileName(s.song)}.fingering.json`, file);
}

/** Keep only `floor → lane` pairs that fit this level and the lane count. */
function cleanNotes(raw: unknown, laneCount: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [floor, lane] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(floor)) continue;
    if (typeof lane !== 'number' || !Number.isInteger(lane) || lane < 0 || lane >= laneCount) continue;
    out[floor] = lane;
  }
  return out;
}

/** Keep only valid `floor → base` switches, sorted. */
function cleanBases(raw: unknown): LevelOverrides['bases'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b): b is { floor: number; base: 2 | 4 } =>
        !!b && typeof b === 'object' && Number.isInteger(b.floor) && (b.base === 2 || b.base === 4),
    )
    .map((b) => ({ floor: b.floor, base: b.base }))
    .sort((a, b) => a.floor - b.floor);
}

/** Ask for a fingering file and replace this level's edits with it. Returns a message for the user. */
export async function importLevelFingering(model: ChartModel): Promise<string> {
  const data = (await pickJsonFile()) as Partial<LevelFingeringFile> | null;
  const o = data?.overrides as Partial<LevelOverrides> | undefined;
  if (!o || typeof o !== 'object') throw new Error('타법 파일이 아닙니다.');
  const notes = cleanNotes(o.notes, model.lanes.length);
  const bases = cleanBases(o.bases);
  useOverrides.getState().patch(model.loaded.hash, () => ({
    sections: Array.isArray(o.sections) ? o.sections : null,
    ranges: Array.isArray(o.ranges) ? o.ranges : [],
    notes,
    bases,
  }));

  const floors = new Set(Array.from(model.noteFloors));
  const count = Object.keys(notes).length;
  const missing = Object.keys(notes).filter((f) => !floors.has(Number(f))).length;
  const otherLevel = data?.level?.hash && data.level.hash !== model.loaded.hash;
  return (
    (bases.length
      ? `노트 수정 ${count}개, 키 기반 전환 ${bases.length}곳을 가져왔어요.`
      : `노트 수정 ${count}개를 가져왔어요.`) +
    (otherLevel ? ' 다른 레벨 파일에서 만든 수정이라 타일 번호로 맞췄어요.' : '') +
    (missing ? ` ${missing}개는 이 레벨에 없는 타일이에요.` : '')
  );
}
