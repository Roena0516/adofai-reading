/** Synthesised click: a decaying sine plus a very short noise transient. */
export function makeClick(
  ctx: BaseAudioContext,
  freq: number,
  decay: number,
  noise: number,
  dur = 0.07,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    seed = (seed * 16807) % 2147483647;
    const r = (seed / 2147483647) * 2 - 1;
    const env = Math.exp(-t / decay);
    d[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.7 + r * Math.exp(-t / 0.002) * noise;
  }
  return buf;
}
