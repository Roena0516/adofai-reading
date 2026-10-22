import JSZip from 'jszip';

export interface ArchiveFile {
  path: string;
  data: Uint8Array;
}

export const AUDIO_EXT = /\.(ogg|mp3|wav|m4a|aac|flac|opus|webm)$/i;
export const LEVEL_EXT = /\.adofai$/i;
/** Images a level can show (decorations, backgrounds). */
export const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;

/** Zip file names without the UTF-8 flag are usually in the creator's code page (often CP949 here). */
function decodeFileName(bytes: Uint8Array | string[] | string): string {
  const data =
    typeof bytes === 'string'
      ? Uint8Array.from(bytes, (c) => c.charCodeAt(0) & 0xff)
      : Uint8Array.from(bytes as ArrayLike<number>);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(data);
    } catch {
      return new TextDecoder('utf-8').decode(data);
    }
  }
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dirname = (p: string) => {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
};

export async function readZip(data: ArrayBuffer | Uint8Array): Promise<ArchiveFile[]> {
  const zip = await JSZip.loadAsync(data, { decodeFileName });
  const files: ArchiveFile[] = [];
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && !f.name.startsWith('__MACOSX/') && !basename(f.name).startsWith('._'),
  );
  for (const entry of entries) {
    if (!LEVEL_EXT.test(entry.name) && !AUDIO_EXT.test(entry.name) && !IMAGE_EXT.test(entry.name)) continue;
    files.push({ path: entry.name, data: await entry.async('uint8array') });
  }
  return files;
}

export function decodeText(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data);
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data);
  return new TextDecoder('utf-8').decode(data);
}

/** Pick the audio file a level refers to: same name (case-insensitive), preferring its folder. */
export function matchAudio(
  levelPath: string,
  songFilename: string,
  files: ArchiveFile[],
): ArchiveFile | null {
  const audio = files.filter((f) => AUDIO_EXT.test(f.path));
  if (!audio.length) return null;
  const want = basename(songFilename).toLowerCase();
  const dir = dirname(levelPath);
  const named = audio.filter((f) => basename(f.path).toLowerCase() === want);
  return (
    named.find((f) => dirname(f.path) === dir) ??
    named[0] ??
    audio.find((f) => dirname(f.path) === dir) ??
    audio[0] ??
    null
  );
}
