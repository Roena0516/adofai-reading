import type { ArchiveFile } from '@adofai-reading/core';
import {
  AUDIO_EXT,
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
import type { LoadedLevel } from '../stores/level';
import { useLevel } from '../stores/level';

async function collect(files: File[]): Promise<ArchiveFile[]> {
  const out: ArchiveFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) out.push(...(await readZip(await f.arrayBuffer())));
    else if (LEVEL_EXT.test(f.name) || AUDIO_EXT.test(f.name)) {
      out.push({ path: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  return out;
}

async function build(archive: ArchiveFile[], preferPath?: string): Promise<LoadedLevel> {
  const levels = archive.filter((f) => LEVEL_EXT.test(f.path));
  if (!levels.length)
    throw new Error('.adofai 파일을 찾지 못했습니다. 레벨 zip이나 .adofai 파일을 넣어 주세요.');
  const chosen = levels.find((l) => l.path === preferPath) ?? levels[0]!;
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

export function loadFiles(files: File[]): Promise<void> {
  return run(async () => build(await collect(files)));
}

export function switchLevel(path: string): Promise<void> {
  const cur = useLevel.getState().loaded;
  if (!cur) return Promise.resolve();
  return run(() => build(cur.archive, path));
}
