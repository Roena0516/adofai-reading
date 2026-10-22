import { describe, expect, it } from 'vitest';
import {
  CameraTimeline,
  buildTrackEffects,
  computeTiming,
  computeTrack,
  ease,
  lookColor,
  lookFrom,
  parseLevel,
  tileAppearance,
  tileStateAt,
} from '../src';

const level = (path: string, actions: object[] = [], settings: object = {}) =>
  parseLevel(JSON.stringify({ pathData: path, settings: { bpm: 120, offset: 0, ...settings }, actions }));

describe('ease', () => {
  it('maps names to curves and falls back to linear', () => {
    expect(ease('Linear')(0.25)).toBe(0.25);
    expect(ease('OutCubic')(0.5)).toBeCloseTo(0.875, 6);
    expect(ease('OutBack')(0.6)).toBeGreaterThan(1);
    expect(ease('Nope')(0.3)).toBe(0.3);
  });
});

describe('PositionTrack layout', () => {
  it('shifts a tile and everything after it', () => {
    const t = computeTrack(
      level('RRRR').angles,
      level('RRRR', [{ floor: 2, eventType: 'PositionTrack', positionOffset: [0, 1] }]).actionsByFloor,
    );
    expect(Array.from(t.y)).toEqual([0, 0, 1, 1, 1]);
    expect(Array.from(t.x)).toEqual([0, 1, 2, 3, 4]);
  });

  it('justThisTile moves only that tile and editor-only shifts are ignored', () => {
    const lv = level('RRRR', [
      { floor: 2, eventType: 'PositionTrack', positionOffset: [0, 1], justThisTile: true },
      { floor: 3, eventType: 'PositionTrack', positionOffset: [0, 5], editorOnly: true },
    ]);
    expect(Array.from(computeTrack(lv.angles, lv.actionsByFloor).y)).toEqual([0, 0, 1, 0, 0]);
  });
});

describe('MoveTrack and AnimateTrack', () => {
  // 120 BPM straight tiles: floor f is hit at (f - 1) * 0.5 s
  const lv = level('RRRRRRRR', [
    {
      floor: 2,
      eventType: 'MoveTrack',
      startTile: [-1, 'ThisTile'],
      endTile: [-1, 'ThisTile'],
      duration: 2,
      positionOffset: [4, null],
      opacity: 0,
      ease: 'Linear',
    },
    {
      floor: 3,
      eventType: 'MoveTrack',
      startTile: [-2, 'ThisTile'],
      endTile: [-2, 'ThisTile'],
      duration: 0,
      positionOffset: [null, 2],
    },
    {
      floor: 4,
      eventType: 'AnimateTrack',
      trackAnimation: 'Fade',
      beatsAhead: 2,
      trackDisappearAnimation: 'None',
      beatsBehind: 0,
    },
  ]);
  const timing = computeTiming(lv);
  const fx = buildTrackEffects(lv, timing);

  it('tweens a tile channel by channel from its current value', () => {
    // floor 1 moves right over 1 s starting at 0.5 s; at 1.0 s a second event sets dy instantly
    expect(tileStateAt(fx, 1, 0.25).dx).toBe(0);
    expect(tileStateAt(fx, 1, 1.0).dx).toBeCloseTo(2, 6);
    expect(tileStateAt(fx, 1, 1.0).dy).toBeCloseTo(2, 6);
    expect(tileStateAt(fx, 1, 1.0).opacity).toBeCloseTo(0.5, 6);
    expect(tileStateAt(fx, 1, 5).dx).toBeCloseTo(4, 6);
    expect(tileStateAt(fx, 2, 5).dx).toBe(0);
  });

  it('hides tiles until beatsAhead before they are reached', () => {
    // floor 6 is hit at 2.5 s, appears 2 beats (1 s) earlier
    expect(tileAppearance(fx, 6, 1.0).alpha).toBe(0);
    expect(tileAppearance(fx, 6, 1.6).alpha).toBeGreaterThan(0);
    expect(tileAppearance(fx, 6, 2.5).alpha).toBe(1);
    expect(tileAppearance(fx, 2, 0).alpha).toBe(1);
  });
});

describe('tiles hidden by MoveTrack and shown by AnimateTrack (Flower Rocket #1722)', () => {
  // 120 BPM straight tiles: floor f is hit at (f - 1) * 0.5 s
  const lv = level('RRRRRRRRRR', [
    // at floor 1: shrink floors 6..9 to nothing and fade them a little, instantly
    {
      floor: 1,
      eventType: 'MoveTrack',
      startTile: [6, 'Start'],
      endTile: [9, 'Start'],
      duration: 0,
      scale: [0, 0],
      opacity: 80,
    },
    // at floor 2: tiles grow in (Extend) 2 beats before they are reached
    {
      floor: 2,
      eventType: 'AnimateTrack',
      trackAnimation: 'Extend',
      beatsAhead: 2,
      trackDisappearAnimation: 'None',
      beatsBehind: 0,
    },
    // at floor 5 (2 s): floor 8 grows to half size over 4 beats (2 s → 4 s); it starts to appear
    // at 2.5 s, while this is still running
    {
      floor: 5,
      eventType: 'MoveTrack',
      startTile: [3, 'ThisTile'],
      endTile: [3, 'ThisTile'],
      duration: 4,
      scale: [50, 50],
      ease: 'Linear',
    },
  ]);
  const timing = computeTiming(lv);
  const fx = buildTrackEffects(lv, timing);

  it('brings back the size the appear animation controls, keeping the other changes', () => {
    // floor 7 is hit at 3 s and starts to appear 1 s earlier
    expect(tileStateAt(fx, 7, 1.5).sx).toBe(0);
    expect(tileStateAt(fx, 7, 2.5)).toMatchObject({ sx: 1, sy: 1, opacity: 0.8 });
  });

  it('leaves a value alone while a MoveTrack is still tweening it', () => {
    expect(tileStateAt(fx, 8, 3)).toMatchObject({ sx: 0.25, sy: 0.25 });
    expect(tileStateAt(fx, 8, 6).sx).toBeCloseTo(0.5, 6);
  });
});

describe('planets on moved tiles (Flower Rocket #1198)', () => {
  // at floor 2 floors 2..8 slide 2 tiles left over one beat; stickToFloors is off
  const lv = level(
    'RRRRRRRR',
    [
      {
        floor: 2,
        eventType: 'MoveTrack',
        startTile: [0, 'ThisTile'],
        endTile: [8, 'Start'],
        duration: 1,
        positionOffset: [-2, 0],
        ease: 'Linear',
      },
    ],
    { stickToFloors: false },
  );
  const timing = computeTiming(lv);
  const track = computeTrack(lv.angles, lv.actionsByFloor);
  const fx = buildTrackEffects(lv, timing);

  it('lands the planet (and the camera) where the tile is at that moment', () => {
    const cam = new CameraTimeline(lv, timing, track, fx, { follow: Infinity, events: false });
    // floor 4 is reached after the slide: it is drawn at x = 4 - 2, and so is the planet
    const t4 = timing.tiles[4]!.time + 0.01;
    expect(track.x[4]! + tileStateAt(fx, 4, t4).dx).toBeCloseTo(2, 6);
    expect(cam.at(t4).x).toBeCloseTo(2, 6);
  });
});

describe('track colours', () => {
  it('reads RGBA hex and alternates stripes', () => {
    const look = lookFrom({
      trackColorType: 'Stripes',
      trackColor: 'f2ff00ff',
      secondaryTrackColor: '15fcff',
    });
    expect(look.primary).toEqual([242, 255, 0]);
    expect(lookColor(look, 0, 0)).toEqual([242, 255, 0]);
    expect(lookColor(look, 1, 0)).toEqual([21, 252, 255]);
  });
});

describe('CameraTimeline', () => {
  const lv = level('RRRRRRRR', [
    { floor: 3, eventType: 'MoveCamera', relativeTo: 'Tile', position: [0, 2], zoom: 200, duration: 0 },
    {
      floor: 5,
      eventType: 'MoveCamera',
      relativeTo: 'LastPosition',
      position: [1, 0],
      rotation: 30,
      duration: 2,
      ease: 'Linear',
    },
    { floor: 7, eventType: 'MoveCamera', relativeTo: 'Player', position: [0, 0], duration: 0 },
  ]);
  const timing = computeTiming(lv);
  const track = computeTrack(lv.angles, lv.actionsByFloor);

  it('follows the planet with a lag and catches up', () => {
    const cam = new CameraTimeline(lv, timing, track, null, { follow: 4, events: false });
    // Right after landing on x = 2 the camera is still behind; a while after the last tile it has caught up.
    const justLanded = cam.at(timing.tiles[2]!.time + 0.01);
    expect(justLanded.x).toBeGreaterThan(0.5);
    expect(justLanded.x).toBeLessThan(2);
    expect(cam.at(timing.tiles[8]!.time + 3).x).toBeCloseTo(8, 3);
    const instant = new CameraTimeline(lv, timing, track, null, { follow: Infinity, events: false });
    expect(instant.at(timing.tiles[2]!.time + 0.01).x).toBe(2);
  });

  it('never jumps in speed when the planet lands', () => {
    const cam = new CameraTimeline(lv, timing, track, null, { follow: 8, events: false });
    // a plain exponential lag would jump by follow × step = 8 tiles/s here
    const speed = (t: number) => (cam.at(t + 5e-5).x - cam.at(t - 5e-5).x) / 1e-4;
    for (const f of [2, 5, 8]) {
      const land = timing.tiles[f]!.time;
      expect(Math.abs(speed(land + 2e-4) - speed(land - 2e-4))).toBeLessThan(0.2);
    }
  });

  it('moves to a tile, offsets from the last position, and returns to the player', () => {
    const cam = new CameraTimeline(lv, timing, track, null, { follow: Infinity, events: true });
    const t3 = timing.tiles[3]!.time;
    expect(cam.at(t3 + 0.01)).toMatchObject({ x: 3, y: 2, zoom: 200 });
    const t5 = timing.tiles[5]!.time;
    const mid = cam.at(t5 + 0.5);
    expect(mid.x).toBeCloseTo(3.5, 6);
    expect(mid.rotation).toBeCloseTo(15, 6);
    // duration 2 beats at 120 BPM = 1 s
    expect(cam.at(t5 + 0.999).x).toBeCloseTo(4, 2);
    const t7 = timing.tiles[7]!.time;
    expect(cam.at(t7 + 0.01).x).toBe(7);
  });
});
