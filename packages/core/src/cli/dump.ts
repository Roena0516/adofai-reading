/**
 * Print what the engine sees in a level, for checking against the game.
 *   pnpm dump "<path to .adofai or .zip>" [--base 2|4] [--style inout|outin|stairs] [--notes 40]
 */
import { readFileSync } from 'node:fs';
import type { KeyBase, RollStyle } from '../index';
import {
  BASE_LABEL,
  analyzeRhythm,
  assignFingering,
  computeTiming,
  decodeText,
  describeOrder,
  detectSections,
  divisionLabel,
  laneLabel,
  matchAudio,
  defaultProfile,
  effectiveBands,
  parseLevel,
  readZip,
} from '../index';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.error(
    'usage: dump <level.adofai | level.zip> [--base 2|4] [--style inout|outin|stairs] [--notes N]',
  );
  process.exit(1);
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;

async function main() {
  const buf = readFileSync(file!);
  let text: string;
  let audioName = '-';
  if (/\.zip$/i.test(file!)) {
    const files = await readZip(buf);
    const lvl = files.find((f) => /\.adofai$/i.test(f.path));
    if (!lvl) throw new Error('no .adofai in zip');
    text = decodeText(lvl.data);
    const level = parseLevel(text);
    audioName = matchAudio(lvl.path, level.settings.songFilename, files)?.path ?? '(없음)';
  } else {
    text = decodeText(buf);
  }
  const level = parseLevel(text);
  const timing = computeTiming(level);
  const sections = detectSections(timing);
  const analysis = analyzeRhythm(timing, sections);
  const base: KeyBase = opt('base') === '2' ? 2 : 4;
  const style = (
    ['inout', 'outin', 'stairs'].includes(opt('style') ?? '') ? opt('style') : 'inout'
  ) as RollStyle;
  const profile = defaultProfile(base, style);
  const fingering = assignFingering(
    analysis,
    timing.notes.map((n) => n.floor),
    profile,
  );

  const s = level.settings;
  console.log(`${s.artist} - ${s.song}  (by ${s.author})`);
  console.log(
    `format ${level.source} v${s.version}  bpm ${s.bpm}  offset ${s.offset}ms  pitch ${s.pitch}%  audio ${audioName}`,
  );
  console.log(
    `floors ${level.angles.length + 1}  notes ${timing.notes.length}  first ${fmt(timing.notes[0]?.time ?? 0)}  last ${fmt(timing.endTime)}`,
  );
  console.log(
    `events ${analysis.events.length} (chords ${analysis.events.filter((e) => e.noteCount > 1).length})  runs ${analysis.runs.length}`,
  );
  for (const w of [...level.warnings, ...timing.warnings]) console.log(`! ${w}`);
  console.log('\nbase sections:');
  for (const sec of sections)
    console.log(
      `  floor ${String(sec.startFloor).padStart(5)}  ${fmt(sec.startTime)}  ${sec.bpm.toFixed(2)} BPM`,
    );

  const bandUse = new Map<number, number>();
  analysis.runs.forEach((r, i) =>
    bandUse.set(fingering.runBand[i]!, (bandUse.get(fingering.runBand[i]!) ?? 0) + r.noteCount),
  );
  console.log(`\n${BASE_LABEL[base]} (${style}) lanes ${fingering.lanes.map(laneLabel).join(' ')}`);
  effectiveBands(profile).bands.forEach((b, i) =>
    console.log(`  band ${i + 1}: ≤ ${b.upTo ?? '∞'}비트  ${b.order.padEnd(9)} notes ${bandUse.get(i) ?? 0}`),
  );
  for (const e of fingering.errors) console.log(`! ${e}`);

  const fastest = [...analysis.runs]
    .filter((r) => r.eventCount >= 4)
    .sort((a, b) => b.effBpm - a.effBpm)
    .slice(0, 8);
  console.log('\nfastest runs (≥4 events):');
  for (const r of fastest) {
    console.log(
      `  ${fmt(r.startTime)}  ${r.effBpm.toFixed(0).padStart(5)} bpm  ${divisionLabel(r.division, r.divisionRaw).padEnd(8)} ${String(r.eventCount).padStart(4)} ev  ${describeOrder(fingering.runSeq[r.index]!, fingering.lanes)}`,
    );
  }

  const count = Number(opt('notes') ?? 40);
  console.log(`\nfirst ${count} notes:`);
  for (let i = 0; i < Math.min(count, timing.notes.length); i++) {
    const n = timing.notes[i]!;
    const ev = analysis.events[analysis.noteEvent[i]!]!;
    const lane = fingering.lanes[fingering.noteLane[i]!]!;
    console.log(
      `  #${String(n.floor).padStart(5)} ${fmt(n.time)}  beat ${ev.beatPos.toFixed(3).padStart(8)}  ${ev.effBpm.toFixed(0).padStart(5)}bpm ${divisionLabel(ev.division, ev.divisionRaw).padEnd(8)} run ${String(ev.run).padStart(4)}  ${laneLabel(lane)} (${lane.index + 1})${ev.noteCount > 1 ? '  chord' : ''}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
