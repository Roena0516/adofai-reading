import { lowerBound } from '@adofai-reading/core';
import { makeClick } from './sounds';

const LEAD = 0.05;
const LOOKAHEAD = 0.15;

/**
 * Sample-accurate song clock on top of Web Audio.
 * `now()` returns the song position that is audible at a given performance.now() time,
 * so visuals and key presses are compared against what the player hears.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly music: GainNode;
  private readonly hits: GainNode;
  private readonly metro: GainNode;
  private readonly tick: AudioBuffer;
  private readonly beatTick: AudioBuffer;
  private readonly barTick: AudioBuffer;

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playing_ = false;
  private rate_ = 1;
  private anchorCtx = 0;
  private anchorSong = 0;
  private pausedAt = 0;
  duration = 0;

  private hitTimes: Float64Array = new Float64Array(0);
  private hitPan: Float32Array = new Float32Array(0);
  private hitPitch: Float32Array = new Float32Array(0);
  private hitIdx = 0;
  private metroTimes: Float64Array = new Float64Array(0);
  private metroBar: Uint8Array = new Uint8Array(0);
  private metroIdx = 0;
  hitsEnabled = true;
  metroEnabled = false;

  private timer: number | null = null;
  private readonly live = new Set<AudioBufferSourceNode>();
  onEnded: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.music = this.ctx.createGain();
    this.hits = this.ctx.createGain();
    this.metro = this.ctx.createGain();
    for (const g of [this.music, this.hits, this.metro]) g.connect(this.ctx.destination);
    this.tick = makeClick(this.ctx, 1500, 0.012, 0.35);
    this.beatTick = makeClick(this.ctx, 2400, 0.02, 0);
    this.barTick = makeClick(this.ctx, 3200, 0.025, 0);
  }

  get playing(): boolean {
    return this.playing_;
  }

  get rate(): number {
    return this.rate_;
  }

  get hasSong(): boolean {
    return this.buffer !== null;
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return await this.ctx.decodeAudioData(data);
  }

  setSong(buffer: AudioBuffer | null, fallbackDuration: number): void {
    this.pause();
    this.buffer = buffer;
    this.duration = Math.max(buffer?.duration ?? 0, fallbackDuration);
    this.pausedAt = 0;
  }

  setVolumes(v: { music: number; hits: number; metro: number }): void {
    this.music.gain.value = v.music;
    this.hits.gain.value = v.hits;
    this.metro.gain.value = v.metro;
  }

  setHits(times: Float64Array, pan: Float32Array, pitch: Float32Array): void {
    this.hitTimes = times;
    this.hitPan = pan;
    this.hitPitch = pitch;
    if (this.playing_) this.resync();
  }

  setMetronome(times: Float64Array, bar: Uint8Array): void {
    this.metroTimes = times;
    this.metroBar = bar;
    if (this.playing_) this.resync();
  }

  private outputCtxTime(perfNow: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime)
      return ts.contextTime + (perfNow - ts.performanceTime) / 1000;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return this.ctx.currentTime - latency + (perfNow - performance.now()) / 1000;
  }

  /** Song position audible at `perfNow` (defaults to now). */
  now(perfNow: number = performance.now()): number {
    if (!this.playing_) return this.pausedAt;
    return this.anchorSong + (this.outputCtxTime(perfNow) - this.anchorCtx) * this.rate_;
  }

  private toCtx(song: number): number {
    return this.anchorCtx + (song - this.anchorSong) / this.rate_;
  }

  async play(from?: number): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (from !== undefined) this.pausedAt = from;
    else if (this.pausedAt >= this.duration) this.pausedAt = 0;
    this.stopVoices();
    this.anchorCtx = this.ctx.currentTime + LEAD;
    this.anchorSong = this.pausedAt;
    if (this.buffer && this.pausedAt < this.buffer.duration) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.playbackRate.value = this.rate_;
      src.connect(this.music);
      if (this.pausedAt >= 0) src.start(this.anchorCtx, this.pausedAt);
      else src.start(this.toCtx(0), 0);
      this.source = src;
    }
    this.playing_ = true;
    this.resetCursors(this.pausedAt);
    this.schedule();
    if (this.timer === null) this.timer = window.setInterval(this.schedule, 25);
  }

  pause(): void {
    if (this.playing_) this.pausedAt = this.now();
    this.playing_ = false;
    this.stopVoices();
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  seek(t: number): void {
    if (this.playing_) void this.play(t);
    else this.pausedAt = t;
  }

  setRate(r: number): void {
    if (r === this.rate_) return;
    if (this.playing_) {
      const t = this.now();
      this.rate_ = r;
      void this.play(t);
    } else {
      this.rate_ = r;
    }
  }

  /** Immediate key-press sound. */
  click(pan: number, pitch: number): void {
    if (this.ctx.state !== 'running') return;
    this.voice(this.tick, this.ctx.currentTime, pan, pitch, this.hits);
  }

  private resync(): void {
    this.stopVoices(true);
    this.resetCursors(this.now());
  }

  private resetCursors(song: number): void {
    this.hitIdx = lowerBound(this.hitTimes, song - 1e-4);
    this.metroIdx = lowerBound(this.metroTimes, song - 1e-4);
  }

  private stopVoices(keepMusic = false): void {
    for (const v of this.live) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
    if (!keepMusic && this.source) {
      try {
        this.source.stop();
      } catch {
        /* not started */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  private voice(buf: AudioBuffer, at: number, pan: number, pitch: number, bus: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    let node: AudioNode = src;
    if (pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(p);
      node = p;
    }
    node.connect(bus);
    src.onended = () => {
      this.live.delete(src);
      node.disconnect();
    };
    this.live.add(src);
    src.start(at);
  }

  private schedule = (): void => {
    if (!this.playing_) return;
    const ctxNow = this.ctx.currentTime;
    const horizon = ctxNow + LOOKAHEAD;
    while (this.hitIdx < this.hitTimes.length) {
      const at = this.toCtx(this.hitTimes[this.hitIdx]!);
      if (at > horizon) break;
      if (this.hitsEnabled && at >= ctxNow - 0.005) {
        this.voice(this.tick, at, this.hitPan[this.hitIdx] ?? 0, this.hitPitch[this.hitIdx] ?? 1, this.hits);
      }
      this.hitIdx++;
    }
    while (this.metroIdx < this.metroTimes.length) {
      const at = this.toCtx(this.metroTimes[this.metroIdx]!);
      if (at > horizon) break;
      if (this.metroEnabled && at >= ctxNow - 0.005) {
        this.voice(this.metroBar[this.metroIdx] ? this.barTick : this.beatTick, at, 0, 1, this.metro);
      }
      this.metroIdx++;
    }
    if (this.now() > this.duration + 0.3) {
      this.pause();
      this.pausedAt = this.duration;
      this.onEnded?.();
    }
  };
}

export const engine = new AudioEngine();
