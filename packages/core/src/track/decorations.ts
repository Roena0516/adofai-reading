import type { Level, LevelAction } from '../parse/level';
import { num, toBool } from '../parse/level';
import type { Timing } from '../timing/timing';
import type { EaseFn } from './ease';
import { ease } from './ease';
import { beatsToSeconds, eventTime } from './effects';
import { levelEvents, tagsOf } from './events';
import type { Track } from './track';
import { vec2 } from './track';
import type { RGBA } from './vfx';
import { NumTrack, hexColor, stepAt } from './vfx';

/** Image pixels per tile at 100 % (Unity: 100 px per unit, 1.5 units between floors). */
export const DECORATION_PX_PER_TILE = 150;

export interface Decoration {
  index: number;
  kind: 'image' | 'text';
  floor: number;
  image: string;
  text: string;
  font: string;
  /** Tile, Global, RedPlanet, BluePlanet, Camera… */
  relativeTo: string;
  /** Position in tiles (for Tile: from the floor's original position). */
  position: [number, number];
  pivot: [number, number];
  rotation: number;
  /** Percent. */
  scale: [number, number];
  /** How many times the image repeats across and down. */
  tile: [number, number];
  color: RGBA;
  opacity: number;
  /** Lower is nearer; above 0 is behind the track. */
  depth: number;
  /** Percent of the camera movement it follows (100 = fixed on screen). */
  parallax: [number, number];
  /** Shifts the point the parallax is measured from, in tiles. */
  parallaxOffset: [number, number];
  tags: string[];
  smooth: boolean;
  lockRotation: boolean;
  lockScale: boolean;
  blend: string;
  visible: boolean;
}

interface Swap<T> {
  t: number;
  value: T;
}

export interface DecorationState {
  deco: Decoration;
  /** Offset from the anchor in tiles (position + MoveDecorations offset). */
  x: number;
  y: number;
  /** Anchor the offset is measured from: world point for Tile/Global, else resolved by the renderer. */
  anchor: 'world' | 'redPlanet' | 'bluePlanet' | 'camera';
  /**
   * Where the parallax is measured from (its tile, or the origin for Global): the decoration is drawn at
   * x + (camera − ref) × parallax. Measuring from the origin would push decorations far along the track
   * off screen (Feral's −20 % side bars from #1196); decorations side by side keep their spacing.
   */
  ref: [number, number];
  rotation: number;
  sx: number;
  sy: number;
  color: RGBA;
  opacity: number;
  parallax: [number, number];
  visible: boolean;
  image: string;
  text: string;
}

export interface Decorations {
  list: Decoration[];
  at: (t: number) => DecorationState[];
  /** Image files the decorations show at any point. */
  images: string[];
}

const CHANNELS = 12;

function parseDecoration(ev: LevelAction, index: number): Decoration | null {
  const kind = ev.eventType === 'AddText' ? 'text' : ev.eventType === 'AddDecoration' ? 'image' : null;
  if (!kind) return null;
  const [x, y] = vec2(ev.position);
  const [pivX, pivY] = vec2(ev.pivotOffset);
  const sc = Array.isArray(ev.scale) ? vec2(ev.scale) : [num(ev.scale, 100), num(ev.scale, 100)];
  const [tx, ty] = vec2(ev.tile);
  const [parX, parY] = vec2(ev.parallax);
  return {
    index,
    kind,
    floor: ev.floor,
    image: typeof ev.decorationImage === 'string' ? ev.decorationImage : '',
    text: typeof ev.decText === 'string' ? ev.decText : '',
    font: typeof ev.font === 'string' ? ev.font : 'Default',
    relativeTo: typeof ev.relativeTo === 'string' ? ev.relativeTo : 'Tile',
    position: [x ?? 0, y ?? 0],
    pivot: [pivX ?? 0, pivY ?? 0],
    rotation: num(ev.rotation, 0),
    scale: [sc[0] ?? 100, sc[1] ?? 100],
    tile: [Math.max(1, Math.trunc(tx ?? 1)), Math.max(1, Math.trunc(ty ?? 1))],
    color: hexColor(ev.color, [255, 255, 255, 1]),
    opacity: num(ev.opacity, 100) / 100,
    depth: num(ev.depth, -1),
    parallax: [parX ?? 0, parY ?? 0],
    parallaxOffset: [vec2(ev.parallaxOffset)[0] ?? 0, vec2(ev.parallaxOffset)[1] ?? 0],
    tags: tagsOf(ev.tag),
    smooth: toBool(ev.imageSmoothing, true),
    lockRotation: toBool(ev.lockRotation, false),
    lockScale: toBool(ev.lockScale, false),
    blend: typeof ev.blendMode === 'string' ? ev.blendMode : 'None',
    visible: ev.visible === undefined ? true : toBool(ev.visible, true),
  };
}

/**
 * Decorations (images and text added with AddDecoration / AddText or listed apart) and how
 * MoveDecorations and SetText change them over time. They exist from the start of the level and are
 * placed relative to their floor's original position (or globally, or to a planet or the camera).
 */
export function buildDecorations(level: Level, timing: Timing, track: Track): Decorations {
  const n = timing.tiles.length - 1;
  const byFloor = levelEvents(level);
  const list: Decoration[] = [];
  const add = (ev: LevelAction) => {
    if (ev.active === false) return;
    const d = parseDecoration(ev, list.length);
    if (d) list.push(d);
  };
  for (const ev of level.decorations) add(ev);
  for (let f = 0; f <= n; f++) for (const ev of level.actionsByFloor[f] ?? []) add(ev);

  const byTag = new Map<string, number[]>();
  for (const d of list)
    for (const tag of d.tags) (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push(d.index);
  const targets = (tag: unknown) => {
    const out = new Set<number>();
    for (const t of tagsOf(tag)) for (const i of byTag.get(t) ?? []) out.add(i);
    return out;
  };

  // per decoration, per channel (dx, dy, rotation, sx, sy, opacity, r, g, b, a, parallax offset x, y)
  const channels: Array<Array<NumTrack | null>> = list.map(() =>
    new Array<NumTrack | null>(CHANNELS).fill(null),
  );
  const baseOf = (d: Decoration) => [
    0,
    0,
    0,
    d.scale[0],
    d.scale[1],
    d.opacity,
    ...d.color,
    d.parallaxOffset[0],
    d.parallaxOffset[1],
  ];
  const visible: Array<Swap<boolean>[]> = list.map(() => []);
  const images: Array<Swap<string>[]> = list.map(() => []);
  const texts: Array<Swap<string>[]> = list.map(() => []);

  for (let f = 0; f <= n; f++) {
    for (const ev of byFloor[f] ?? []) {
      if (ev.active === false) continue;
      if (ev.eventType !== 'MoveDecorations' && ev.eventType !== 'SetText') continue;
      const t = eventTime(timing, f, ev.angleOffset);
      const ids = targets(ev.tag);
      if (!ids.size) continue;
      if (ev.eventType === 'SetText') {
        const text = typeof ev.decText === 'string' ? ev.decText : '';
        for (const i of ids) texts[i]!.push({ t, value: text });
        continue;
      }
      const [dx, dy] = vec2(ev.positionOffset);
      const [sx, sy] = Array.isArray(ev.scale)
        ? vec2(ev.scale)
        : ev.scale !== undefined
          ? [num(ev.scale, 100), num(ev.scale, 100)]
          : [null, null];
      const [px, py] = vec2(ev.parallaxOffset);
      const color = ev.color !== undefined ? hexColor(ev.color, [255, 255, 255, 1]) : null;
      const dur = beatsToSeconds(timing, f, ev.duration);
      const e: EaseFn = ease(ev.ease);
      const v = [
        dx,
        dy,
        typeof ev.rotationOffset === 'number' ? ev.rotationOffset : null,
        sx,
        sy,
        typeof ev.opacity === 'number' ? ev.opacity / 100 : null,
        color ? color[0] : null,
        color ? color[1] : null,
        color ? color[2] : null,
        color ? color[3] : null,
        px,
        py,
      ];
      for (const i of ids) {
        const chans = channels[i]!;
        const base = baseOf(list[i]!);
        v.forEach((target, c) => {
          if (target == null) return;
          (chans[c] ??= new NumTrack(base[c]!)).add(t, dur, e, target);
        });
        if (ev.visible !== undefined) visible[i]!.push({ t, value: toBool(ev.visible, true) });
        if (typeof ev.decorationImage === 'string' && ev.decorationImage)
          images[i]!.push({ t, value: ev.decorationImage });
      }
    }
  }
  for (const chans of channels) for (const ch of chans) ch?.finish();
  for (const l of [...visible, ...images, ...texts]) l.sort((a, b) => a.t - b.t);

  const vals = new Float64Array(CHANNELS);
  const evalTweens = (d: Decoration, i: number, t: number) => {
    const base = baseOf(d);
    const chans = channels[i]!;
    for (let c = 0; c < CHANNELS; c++) vals[c] = chans[c] ? chans[c]!.at(t) : base[c]!;
  };

  const allImages = new Set<string>();
  list.forEach((d, i) => {
    if (d.image) allImages.add(d.image);
    for (const s of images[i]!) allImages.add(s.value);
  });

  return {
    list,
    images: [...allImages],
    at: (t) =>
      list.map((d, i) => {
        evalTweens(d, i, t);
        let x = d.position[0] + vals[0]!;
        let y = d.position[1] + vals[1]!;
        let anchor: DecorationState['anchor'] = 'world';
        let refX = vals[10]!;
        let refY = vals[11]!;
        switch (d.relativeTo) {
          case 'RedPlanet':
            anchor = 'redPlanet';
            break;
          case 'BluePlanet':
            anchor = 'bluePlanet';
            break;
          case 'Camera':
          case 'CameraAspect':
            anchor = 'camera';
            break;
          case 'Global':
            break;
          default: {
            const f = Math.max(0, Math.min(n, d.floor));
            x += track.x[f]!;
            y += track.y[f]!;
            refX += track.x[f]!;
            refY += track.y[f]!;
          }
        }
        return {
          deco: d,
          x,
          y,
          anchor,
          ref: [refX, refY],
          rotation: d.rotation + vals[2]!,
          sx: vals[3]! / 100,
          sy: vals[4]! / 100,
          opacity: Math.max(0, Math.min(1, vals[5]!)),
          color: [vals[6]!, vals[7]!, vals[8]!, vals[9]!],
          parallax: d.parallax,
          visible: stepAt(visible[i]!, t, d.visible),
          image: stepAt(images[i]!, t, d.image),
          text: stepAt(texts[i]!, t, d.text),
        };
      }),
  };
}
