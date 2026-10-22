import { engine } from '../audio/engine';
import { usePlayer } from '../stores/player';

type ResetListener = (songTime: number) => void;
const resetListeners = new Set<ResetListener>();

/** Called whenever playback jumps or (re)starts, so practice judging can restart from there. */
export function onPlaybackReset(fn: ResetListener): () => void {
  resetListeners.add(fn);
  return () => resetListeners.delete(fn);
}

function emitReset(t: number): void {
  for (const fn of resetListeners) fn(t);
}

engine.onEnded = () => usePlayer.getState().set({ playing: false, time: engine.now() });

export async function play(from?: number): Promise<void> {
  await engine.play(from);
  usePlayer.getState().set({ playing: true });
  emitReset(from ?? engine.now());
}

export function pause(): void {
  engine.pause();
  usePlayer.getState().set({ playing: false, time: engine.now() });
}

export async function togglePlay(): Promise<void> {
  if (engine.playing) pause();
  else await play();
}

export function seek(t: number): void {
  const clamped = Math.max(-5, Math.min(engine.duration, t));
  engine.seek(clamped);
  usePlayer.getState().set({ time: clamped });
  emitReset(clamped);
}

export function nudge(dt: number): void {
  seek(engine.now() + dt);
}

export function setRate(rate: number): void {
  engine.setRate(rate);
  emitReset(engine.now());
}

export function setLoopPoint(which: 'A' | 'B', t: number | null = engine.now()): void {
  const p = usePlayer.getState();
  if (which === 'A') p.set({ loopA: t, loop: t != null && p.loopB != null ? true : p.loop });
  else p.set({ loopB: t, loop: t != null && p.loopA != null ? true : p.loop });
}

export function setLoop(a: number, b: number): void {
  usePlayer.getState().set({ loopA: Math.min(a, b), loopB: Math.max(a, b), loop: true });
}

export function clearLoop(): void {
  usePlayer.getState().set({ loopA: null, loopB: null, loop: false });
}
