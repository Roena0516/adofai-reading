import type { ArchiveFile } from '@adofai-reading/core';
import {
  AUDIO_EXT,
  IMAGE_EXT,
  LEVEL_EXT,
  computeTiming,
  decodeText,
  matchAudio,
  parseLevel,
  readZip,
} from '@adofai-reading/core';
import { engine } from '../audio/engine';
import { hashString } from '../lib/format';
import { usePlayer } from '../stores/player';
import { usePractice } from '../stores/practice';
import type { LevelOption, LoadedLevel } from '../stores/level';
import { useLevel } from '../stores/level';

async function collect(files: File[]): Promise<ArchiveFile[]> {
  const out: ArchiveFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) out.push(...(await readZip(await f.arrayBuffer())));
    else if (LEVEL_EXT.test(f.name) || AUDIO_EXT.test(f.name) || IMAGE_EXT.test(f.name)) {
      out.push({ path: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  return out;
}

/** The editor's autosave next to the real level; never offered unless it is the only one. */
const isBackup = (path: string) => /(^|\/)backup\.adofai$/i.test(path);

function describe(file: ArchiveFile): LevelOption {
  const base = {
    path: file.path,
    song: '',
    artist: '',
    author: '',
    difficulty: null,
    notes: 0,
    bpm: 0,
    length: 0,
  };
  try {
    const level = parseLevel(decodeText(file.data));
    const timing = computeTiming(level);
    const notes = timing.notes;
    const difficulty = Number(level.rawSettings.difficulty);
    return {
      ...base,
      song: level.settings.song,
      artist: level.settings.artist,
      author: level.settings.author,
      difficulty: Number.isFinite(difficulty) && difficulty > 0 ? difficulty : null,
      notes: notes.length,
      bpm: level.settings.bpm,
      length: notes.length ? notes[notes.length - 1]!.time - notes[0]!.time : 0,
      error: notes.length ? null : '노트가 없습니다',
    };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

async function build(archive: ArchiveFile[], preferPath?: string): Promise<LoadedLevel> {
  const levels = archive.filter((f) => LEVEL_EXT.test(f.path));
  if (!levels.length)
    throw new Error('.adofai 파일을 찾지 못했습니다. 레벨 zip이나 .adofai 파일을 넣어 주세요.');
  const chosen =
    levels.find((l) => l.path === preferPath) ?? levels.find((l) => !isBackup(l.path)) ?? levels[0]!;
  const text = decodeText(chosen.data);
  const level = parseLevel(text);
  const timing = computeTiming(level);
  if (!timing.notes.length) throw new Error('노트가 하나도 없는 레벨입니다.');

  const audioFile = matchAudio(chosen.path, level.settings.songFilename, archive);
  let audio: AudioBuffer | null = null;
  let audioError: string | null = null;
  if (audioFile) {
    try {
      audio = await engine.decode(audioFile.data.slice().buffer);
    } catch {
      audioError = `${audioFile.path}을(를) 재생할 수 없습니다. 이 브라우저가 형식을 지원하지 않을 수 있습니다(Safari는 ogg 미지원). 무음으로 진행합니다.`;
    }
  } else {
    audioError = '음악 파일이 없어 무음으로 진행합니다. 레벨 폴더의 음악 파일을 함께 넣어 주세요.';
  }
  engine.setSong(audio, timing.endTime + 2);

  return {
    hash: hashString(text),
    levelPath: chosen.path,
    level,
    timing,
    audioName: audioFile?.path ?? null,
    audioError,
    levelPaths: levels.map((l) => l.path),
    archive,
  };
}

async function run(task: () => Promise<LoadedLevel>): Promise<void> {
  const store = useLevel.getState();
  store.set({ loading: true, error: null });
  try {
    const loaded = await task();
    const first = loaded.timing.notes[0]!.time;
    engine.seek(Math.max(-2, first - 2));
    usePlayer.getState().set({ playing: false, time: engine.now(), loopA: null, loopB: null, loop: false });
    usePractice.getState().restart();
    useLevel.getState().set({ loaded, loading: false });
  } catch (e) {
    useLevel.getState().set({ loading: false, error: (e as Error).message });
  }
}

/** Open dropped or picked files. With several levels inside, ask which one first (see LevelPicker). */
export async function loadFiles(files: File[]): Promise<void> {
  const store = useLevel.getState();
  store.set({ loading: true, error: null, choice: null });
  let archive: ArchiveFile[];
  try {
    archive = await collect(files);
  } catch (e) {
    store.set({ loading: false, error: (e as Error).message });
    return;
  }
  const levels = archive.filter((f) => LEVEL_EXT.test(f.path) && !isBackup(f.path));
  if (levels.length > 1) {
    const options = levels.map(describe).sort((a, b) => a.notes - b.notes || a.path.localeCompare(b.path));
    store.set({ loading: false, choice: { archive, options } });
    return;
  }
  return run(async () => build(archive));
}

/** Open one of the levels offered after an upload. */
export function chooseLevel(path: string): Promise<void> {
  const choice = useLevel.getState().choice;
  if (!choice) return Promise.resolve();
  useLevel.getState().set({ choice: null });
  return run(() => build(choice.archive, path));
}

export function switchLevel(path: string): Promise<void> {
  const cur = useLevel.getState().loaded;
  if (!cur) return Promise.resolve();
  return run(() => build(cur.archive, path));
}
