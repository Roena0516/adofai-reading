import { parseLenientJson } from './json';
import { pathDataToAngles } from './pathData';

export interface LevelSettings {
  version: number;
  artist: string;
  song: string;
  author: string;
  songFilename: string;
  bpm: number;
  /** Song time (ms) of the first hit. */
  offset: number;
  /** Playback speed of the song in percent. */
  pitch: number;
  volume: number;
  hitsound: string;
  countdownTicks: number;
  separateCountdownTime: boolean;
  previewImage: string;
  bgImage: string;
}

export interface LevelAction {
  floor: number;
  eventType: string;
  [key: string]: unknown;
}

export interface Level {
  settings: LevelSettings;
  /** The settings object exactly as written in the file (track colours, camera, animations…). */
  rawSettings: Record<string, unknown>;
  /** Exit direction of each floor; floor count is `angles.length + 1`. */
  angles: number[];
  actions: LevelAction[];
  /** Actions grouped by floor (index 0..angles.length), in file order. */
  actionsByFloor: LevelAction[][];
  source: 'angleData' | 'pathData';
  warnings: string[];
}

export function num(v: unknown, fallback: number): number {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : fallback;
}

/** ADOFAI stores booleans as true/false or "Enabled"/"Disabled" depending on the version. */
export function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'enabled' || s === 'true') return true;
    if (s === 'disabled' || s === 'false') return false;
  }
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

/** Remove Unity rich-text tags such as <color=#fff> or <size=50> from titles. */
export function stripRichText(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAction(v: unknown): v is LevelAction {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.eventType === 'string' && Number.isFinite(Number(o.floor));
}

export function parseLevel(text: string): Level {
  let raw: unknown;
  try {
    raw = parseLenientJson(text);
  } catch (e) {
    throw new Error(`레벨 파일을 읽지 못했습니다: ${(e as Error).message}`, { cause: e });
  }
  if (!raw || typeof raw !== 'object') throw new Error('레벨 파일 형식이 올바르지 않습니다.');
  const obj = raw as Record<string, unknown>;
  const warnings: string[] = [];

  let angles: number[];
  let source: Level['source'];
  if (Array.isArray(obj.angleData)) {
    angles = obj.angleData.map((a) => num(a, 0));
    source = 'angleData';
  } else if (typeof obj.pathData === 'string') {
    angles = pathDataToAngles(obj.pathData, warnings);
    source = 'pathData';
  } else {
    throw new Error('angleData나 pathData가 없는 파일입니다.');
  }

  const s = (obj.settings && typeof obj.settings === 'object' ? obj.settings : {}) as Record<string, unknown>;
  const settings: LevelSettings = {
    version: num(s.version, 0),
    artist: stripRichText(str(s.artist)),
    song: stripRichText(str(s.song)),
    author: stripRichText(str(s.author)),
    songFilename: str(s.songFilename),
    bpm: num(s.bpm, 100),
    offset: num(s.offset, 0),
    pitch: num(s.pitch, 100),
    volume: num(s.volume, 100),
    hitsound: str(s.hitsound, 'Kick'),
    countdownTicks: num(s.countdownTicks, 4),
    separateCountdownTime: toBool(s.separateCountdownTime, true),
    previewImage: str(s.previewImage),
    bgImage: str(s.bgImage),
  };
  if (!(settings.bpm > 0)) {
    warnings.push('settings.bpm이 올바르지 않아 100으로 처리했습니다.');
    settings.bpm = 100;
  }

  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: LevelAction[] = [];
  for (const a of rawActions) {
    if (isAction(a)) actions.push({ ...a, floor: Math.trunc(Number(a.floor)) });
  }
  const actionsByFloor: LevelAction[][] = Array.from({ length: angles.length + 1 }, () => []);
  let outOfRange = 0;
  for (const a of actions) {
    const bucket = actionsByFloor[a.floor];
    if (bucket) bucket.push(a);
    else outOfRange++;
  }
  if (outOfRange) warnings.push(`타일 범위를 벗어난 이벤트 ${outOfRange}개를 무시했습니다.`);

  return { settings, rawSettings: s, angles, actions, actionsByFloor, source, warnings };
}
