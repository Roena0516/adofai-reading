import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeText, parseLevel, readZip } from '../src';
import type { Level, LevelAction } from '../src';

export function makeLevel(
  path: string,
  opts: {
    bpm?: number;
    offset?: number;
    actions?: Array<Partial<LevelAction> & { floor: number; eventType: string }>;
  } = {},
): Level {
  return parseLevel(
    JSON.stringify({
      pathData: path,
      settings: { bpm: opts.bpm ?? 120, offset: opts.offset ?? 0 },
      actions: opts.actions ?? [],
    }),
  );
}

export const fixturePath = (name: string) => fileURLToPath(new URL(`../../../${name}`, import.meta.url));
export const hasFixture = (name: string) => existsSync(fixturePath(name));

export async function loadFixture(name: string, chart?: string): Promise<Level> {
  const files = await readZip(readFileSync(fixturePath(name)));
  const lvl = files.find((f) => (chart ? f.path.endsWith(chart) : /\.adofai$/i.test(f.path)));
  if (!lvl) throw new Error(`no level in ${name}`);
  return parseLevel(decodeText(lvl.data));
}
