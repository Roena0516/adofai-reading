import type { FingeringProfile } from '@adofai-reading/core';
import { laneLabel, normalizeProfile } from '@adofai-reading/core';
import { downloadJson, pickJsonFile } from '../lib/format';
import { EMPTY_OVERRIDES, useOverrides } from '../stores/overrides';
import type { LevelOverrides } from '../stores/overrides';
import { useProfiles } from '../stores/profiles';
import type { ChartModel } from './model';

export const LEVEL_FILE_FORMAT = 'adofai-reading/level-fingering';

/** What a level's fingering file holds; import reads `overrides` (and `profile`). */
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

/** Download the current profile and this level's edits (sections, ranges, dragged notes) as JSON. */
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

/** Same settings, ignoring id and name. */
const sameProfile = (a: FingeringProfile, b: FingeringProfile) =>
  JSON.stringify({ ...a, id: '', name: '' }) === JSON.stringify({ ...b, id: '', name: '' });

/**
 * Ask for a fingering file and replace this level's edits with it. The file's profile is switched
 * to (added only when no profile has the same settings). Returns a message for the user.
 */
export async function importLevelFingering(model: ChartModel): Promise<string> {
  const data = (await pickJsonFile()) as Partial<LevelFingeringFile> | null;
  const o = data?.overrides as Partial<LevelOverrides> | undefined;
  if (!o || typeof o !== 'object') throw new Error('타법 파일이 아닙니다.');
  const notes = cleanNotes(o.notes, model.lanes.length);
  useOverrides.getState().patch(model.loaded.hash, () => ({
    sections: Array.isArray(o.sections) ? o.sections : null,
    ranges: Array.isArray(o.ranges) ? o.ranges : [],
    notes,
  }));

  let profileNote = '';
  if (data?.profile && typeof data.profile === 'object') {
    const incoming = normalizeProfile(data.profile);
    const store = useProfiles.getState();
    const existing = store.profiles.find((p) => sameProfile(p, incoming));
    if (existing) store.setActive(existing.id);
    else store.importProfiles(incoming);
    // names end in any letter, so avoid particles that depend on the last syllable
    profileNote = existing ? ` (프로필: ${existing.name})` : ` (새 프로필 추가: ${incoming.name})`;
  }

  const floors = new Set(Array.from(model.noteFloors));
  const count = Object.keys(notes).length;
  const missing = Object.keys(notes).filter((f) => !floors.has(Number(f))).length;
  const otherLevel = data?.level?.hash && data.level.hash !== model.loaded.hash;
  return (
    `노트 수정 ${count}개를 가져왔어요.` +
    profileNote +
    (otherLevel ? ' 다른 레벨 파일에서 만든 수정이라 타일 번호로 맞췄어요.' : '') +
    (missing ? ` ${missing}개는 이 레벨에 없는 타일이에요.` : '')
  );
}
