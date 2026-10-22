import { describe, expect, it } from 'vitest';
import { buildDecorations, buildVfx, computeTiming, computeTrack, levelEvents, parseLevel } from '../src';

const level = (path: string, actions: object[] = [], settings: object = {}, decorations?: object[]) =>
  parseLevel(
    JSON.stringify({ pathData: path, settings: { bpm: 120, offset: 0, ...settings }, actions, decorations }),
  );

// 120 BPM straight tiles: floor f is hit at (f - 1) * 0.5 s, one beat = 0.5 s
describe('RepeatEvents', () => {
  it('repeats the tagged events of its floor every interval beats, or every few floors', () => {
    const lv = level('RRRRRRRR', [
      { floor: 2, eventType: 'Flash', duration: 0, eventTag: 'a', startColor: 'ffffff', endColor: 'ffffff' },
      { floor: 2, eventType: 'Flash', duration: 0, startColor: '000000', endColor: '000000' },
      { floor: 2, eventType: 'RepeatEvents', repetitions: 3, interval: 1, tag: 'a' },
      { floor: 3, eventType: 'ShakeScreen', duration: 1 },
      { floor: 3, eventType: 'RepeatEvents', repeatType: 'Floor', repetitions: 2, floorCount: 2, tag: '' },
    ]);
    const ev = levelEvents(lv);
    const flashesA = ev[2]!.filter((a) => a.eventType === 'Flash' && a.eventTag === 'a');
    expect(flashesA.map((a) => a.angleOffset ?? 0)).toEqual([0, 180, 360, 540]);
    expect(ev[2]!.filter((a) => a.eventType === 'Flash' && !a.eventTag)).toHaveLength(1);
    expect([5, 7].map((f) => ev[f]!.filter((a) => a.eventType === 'ShakeScreen').length)).toEqual([1, 1]);
  });
});

describe('tagged events', () => {
  it('run only when a RepeatEvents on their floor names a tag', () => {
    const lv = level('RRRRRRRR', [
      { floor: 1, eventType: 'SetConditionalEvents', lossTag: 'dead' },
      { floor: 2, eventType: 'Flash', duration: 0, eventTag: 'dead' },
      { floor: 2, eventType: 'Flash', duration: 0, eventTag: 'none' },
      { floor: 2, eventType: 'Flash', duration: 0 },
      { floor: 3, eventType: 'ShakeScreen', duration: 1, eventTag: 'beat other' },
      { floor: 3, eventType: 'RepeatEvents', repetitions: 1, interval: 1, tag: 'beat' },
      { floor: 4, eventType: 'ShakeScreen', duration: 1, eventTag: 'beat' },
    ]);
    const ev = levelEvents(lv);
    expect(ev[2]!.map((a) => a.eventTag ?? '')).toEqual(['']);
    expect(ev[3]!.filter((a) => a.eventType === 'ShakeScreen')).toHaveLength(2);
    expect(ev[4]!.filter((a) => a.eventType === 'ShakeScreen')).toHaveLength(0);
  });

  it('skip their own time when every repeat says executeOnCurrentFloor: false', () => {
    const lv = level('RRRRRRRR', [
      { floor: 2, eventType: 'Flash', duration: 0, eventTag: 'k' },
      {
        floor: 2,
        eventType: 'RepeatEvents',
        repetitions: 2,
        interval: 1,
        tag: 'k',
        executeOnCurrentFloor: false,
      },
    ]);
    expect(
      levelEvents(lv)[2]!
        .filter((a) => a.eventType === 'Flash')
        .map((a) => a.angleOffset),
    ).toEqual([180, 360]);
  });
});

describe('screen effects', () => {
  const lv = level(
    'RRRRRRRR',
    [
      {
        floor: 2,
        eventType: 'Flash',
        duration: 2,
        plane: 'Foreground',
        startColor: 'ff0000',
        startOpacity: 100,
        endColor: 'ff0000',
        endOpacity: 0,
      },
      { floor: 2, eventType: 'SetFilter', filter: 'Grayscale', enabled: 'Enabled', intensity: 80 },
      { floor: 3, eventType: 'SetFilter', filter: 'Invert', enabled: true, intensity: 100 },
      {
        floor: 4,
        eventType: 'SetFilter',
        filter: 'Sepia',
        enabled: true,
        intensity: 50,
        disableOthers: 'Enabled',
      },
      {
        floor: 3,
        eventType: 'Bloom',
        enabled: true,
        intensity: 120,
        threshold: 40,
        color: '00ff00ff',
        duration: 0,
      },
      { floor: 5, eventType: 'CustomBackground', color: '112233', bgImage: 'bg.png', bgDisplayMode: 'Tiled' },
      { floor: 4, eventType: 'SetPlanetRotation', ease: 'InQuad', easeParts: 1 },
    ],
    { backgroundColor: '000000' },
  );
  const vfx = buildVfx(lv, computeTiming(lv));

  it('fades a flash out over its duration', () => {
    expect(vfx.at(0.4).flashFront).toBeNull();
    expect(vfx.at(0.5)!.flashFront![3]).toBeCloseTo(1, 6);
    expect(vfx.at(1.0)!.flashFront![3]).toBeCloseTo(0.5, 6);
    expect(vfx.at(2).flashFront).toBeNull();
  });

  it('switches filters on and off, and "disable others" clears the rest', () => {
    expect(vfx.at(0.6).filters).toEqual({ Grayscale: 80 });
    expect(vfx.at(1.1).filters).toEqual({ Grayscale: 80, Invert: 100 });
    expect(vfx.at(1.6).filters).toEqual({ Sepia: 50 });
  });

  it('turns bloom on and follows background changes', () => {
    const s = vfx.at(1.2);
    expect(s.bloom.intensity).toBe(120);
    expect(s.bloom.threshold).toBe(40);
    expect(s.bloom.color.slice(0, 3)).toEqual([0, 255, 0]);
    expect(vfx.at(2.1).background).toMatchObject({ image: 'bg.png', mode: 'Tiled', color: [17, 34, 51, 1] });
    expect(vfx.images).toEqual(['bg.png']);
  });

  it('eases the planet from SetPlanetRotation on', () => {
    expect(vfx.planetProgress(3, 0.5)).toBeCloseTo(0.5, 6);
    expect(vfx.planetProgress(4, 0.5)).toBeCloseTo(0.25, 6);
  });
});

describe('decorations', () => {
  const lv = level(
    'RRRRRRRR',
    [
      {
        floor: 2,
        eventType: 'AddText',
        decText: 'hi',
        position: [1, 0],
        relativeTo: 'Tile',
        tag: 't',
        depth: -1,
      },
      {
        floor: 3,
        eventType: 'MoveDecorations',
        tag: 'd',
        duration: 2,
        positionOffset: [0, 2],
        ease: 'Linear',
      },
      { floor: 4, eventType: 'SetText', decText: 'bye', tag: 't' },
      {
        floor: 4,
        eventType: 'MoveDecorations',
        tag: 'd',
        duration: 0,
        visible: false,
        decorationImage: 'b.png',
      },
    ],
    {},
    [
      {
        floor: 2,
        eventType: 'AddDecoration',
        decorationImage: 'a.png',
        position: [0, 0],
        relativeTo: 'Global',
        scale: [50, 200],
        parallax: [100, 100],
        depth: 5,
        tag: 'd',
      },
    ],
  );
  const timing = computeTiming(lv);
  const track = computeTrack(lv.angles, lv.actionsByFloor);
  const decos = buildDecorations(lv, timing, track);

  it('collects images and text from both places', () => {
    expect(decos.list.map((d) => d.kind)).toEqual(['image', 'text']);
    expect(decos.images.sort()).toEqual(['a.png', 'b.png']);
  });

  it('moves, hides and swaps by tag, and changes text', () => {
    const [img, txt] = decos.at(0.25);
    expect(img).toMatchObject({
      x: 0,
      y: 0,
      sx: 0.5,
      sy: 2,
      visible: true,
      image: 'a.png',
      parallax: [100, 100],
    });
    expect(txt).toMatchObject({
      x: track.x[2]! + 1,
      y: track.y[2]!,
      text: 'hi',
      ref: [track.x[2]!, track.y[2]!],
    });
    expect(img!.ref).toEqual([0, 0]);
    // floor 3 is hit at 1 s; the move takes 2 beats = 1 s
    expect(decos.at(1.5)[0]!.y).toBeCloseTo(1, 6);
    const later = decos.at(1.6);
    expect(later[0]).toMatchObject({ visible: false, image: 'b.png' });
    expect(later[1]!.text).toBe('bye');
  });
});
