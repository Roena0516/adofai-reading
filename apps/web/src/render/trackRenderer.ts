import type {
  CameraTimeline,
  DecorationState,
  Judge,
  JudgeCode,
  RGBA,
  TileState,
  VfxState,
} from '@adofai-reading/core';
import {
  DECORATION_PX_PER_TILE,
  JUDGE,
  floorAt,
  judgeLabel,
  laneLabel,
  lookColor,
  planetsAt,
  planetsOn,
  tileAppearance,
  tileLook,
  tileStateAt,
  upperBound,
} from '@adofai-reading/core';
import type { ChartModel } from '../chart/model';
import { laneColor } from './colors';
import type { LevelImages } from './levelImages';

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
/** Tiles visible top to bottom at camera zoom 100 %. */
const VIEW_TILES = 6.5;
/** Track thickness, arm length, outline and planet radius in tile units (measured from game screenshots). */
const TRACK_W = 0.58;
const ARM = 0.5;
const OUTLINE = 0.03;
const PLANET_R = 0.21;
/**
 * Turns sharper than this (angle between the two arms) get a round back, like the game's 15°–60° tiles
 * (the user confirmed 60°). A mitre would stick out past the tile there; 75° tiles stay mitred.
 */
const ROUND_BELOW = (70 * Math.PI) / 180;
const MITER_LIMIT = 3;
/**
 * Midspins and full turn-backs (360° tiles) stand apart from the tile they come from, as in the game
 * (measured from game screenshots, in tiles from the floor's centre): a 360° tile is a D with its flat
 * side 0.19 back towards the joint and a round cap centred 0.08 beyond; a midspin reaches 0.34 back
 * and ends in a point.
 */
const TURN_BACK = 0.19;
const TURN_CAP = 0.08;
const MIDSPIN_REACH = 0.34;
const FIRE = '#ff4f45';
const ICE = '#3f8cff';

type RGB = [number, number, number];

export interface TrackDrawOptions {
  /** Extra zoom in percent. */
  scale: number;
  labels: boolean;
  colorMode: 'level' | 'finger';
  effects: boolean;
  /** Horizontal centre of the visible area in CSS px (the lanes may cover the left part). */
  centerX?: number;
  /** Screen effects at this time (background, flashes, shake), or null to draw without them. */
  vfx?: VfxState | null;
  /** Ease the planet's turn like SetPlanetRotation. */
  planetEase?: boolean;
  decorations?: boolean;
  images?: LevelImages | null;
  /** Practice: the planets land when this judge records a hit (or miss), like playing the game. */
  play?: Judge | null;
}

/** Judgment text colours in the game: Perfect green, E/L Perfect yellow, Early/Late and misses red. */
const PLAY_COLOR: Partial<Record<JudgeCode, string>> = {
  [JUDGE.perfect]: '#60ff4e',
  [JUDGE.near]: '#fcff4e',
  [JUDGE.far]: '#ff5a4a',
  [JUDGE.miss]: '#ff4a4a',
  [JUDGE.wrong]: '#f2a2b8',
  [JUDGE.tooEarly]: '#ff5a4a',
};
/** A tile drawn this frame, kept for the overlays (badges, judgments) that go on top. */
interface Drawn {
  f: number;
  x: number;
  y: number;
  s: number;
  alpha: number;
}

/** How long a judgment stays over its tile (song seconds). */
const PLAY_TEXT_S = 0.6;

const FONTS: Record<string, string> = {
  Default: FONT,
  Arial: 'Arial, sans-serif',
  ComicSansMS: '"Comic Sans MS", "Comic Sans", cursive',
  CourierNew: '"Courier New", monospace',
  Georgia: 'Georgia, serif',
  Impact: 'Impact, sans-serif',
  TimesNewRoman: '"Times New Roman", serif',
  NotoSans: '"Noto Sans", "Noto Sans KR", sans-serif',
};

const BLENDS: Record<string, GlobalCompositeOperation> = {
  Additive: 'lighter',
  Add: 'lighter',
  Multiply: 'multiply',
  Screen: 'screen',
  Overlay: 'overlay',
  Darken: 'darken',
  Lighten: 'lighten',
};

const rgba = (c: RGBA, a = 1) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, c[3] * a))})`;

interface FloorMarks {
  note: Int32Array;
  twirl: Uint8Array;
  speed: Int8Array;
}

function floorMarks(model: ChartModel): FloorMarks {
  const n = model.timing.tiles.length;
  const note = new Int32Array(n).fill(-1);
  model.timing.notes.forEach((x, i) => (note[x.floor] = i));
  const twirl = new Uint8Array(n);
  model.loaded.level.actionsByFloor.forEach((acts, f) => {
    if (acts.some((a) => a.eventType === 'Twirl' && a.active !== false)) twirl[f] = 1;
  });
  const speed = new Int8Array(n);
  for (let f = 1; f < n; f++) {
    const a = model.timing.tiles[f - 1]!.bpm;
    const b = model.timing.tiles[f]!.bpm;
    if (Math.abs(b - a) > 1e-6) speed[f] = b > a ? 1 : -1;
  }
  return { note, twirl, speed };
}

const css = (c: ArrayLike<number>, a = 1) =>
  `rgba(${Math.round(c[0]!)},${Math.round(c[1]!)},${Math.round(c[2]!)},${a})`;
const scaleRgb = (c: ArrayLike<number>, k: number): RGB => [c[0]! * k, c[1]! * k, c[2]! * k];
const mix = (a: ArrayLike<number>, b: ArrayLike<number>, u: number): RGB => [
  a[0]! + (b[0]! - a[0]!) * u,
  a[1]! + (b[1]! - a[1]!) * u,
  a[2]! + (b[2]! - a[2]!) * u,
];

function parseCss(color: string): RGB {
  const m = color.match(/hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
  if (!m) return [200, 200, 200];
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [f(0), f(8), f(4)];
}

/** Body and rim colours of a tile for a track style; bodies are opaque so overlapping tiles stack cleanly. */
function tileColors(style: string, fill: RGB, bg: RGB): { body: RGB; rim: RGB; glow: boolean } {
  switch (style) {
    case 'Neon':
      return { body: [5, 5, 6], rim: mix(fill, [255, 255, 255], 0.2), glow: true };
    case 'NeonLight':
      return { body: mix(bg, scaleRgb(fill, 0.85), 0.6), rim: mix(fill, [255, 255, 255], 0.2), glow: true };
    case 'Basic':
      return { body: fill, rim: scaleRgb(fill, 0.65), glow: false };
    case 'Minimal':
      return { body: mix(bg, fill, 0.2), rim: fill, glow: false };
    default:
      return { body: fill, rim: scaleRgb(fill, 0.55), glow: false };
  }
}

/** The chart as the game draws it: tiles, track effects, camera and the two planets. */
export class TrackRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private marks: { model: ChartModel | null; data: FloorMarks | null } = { model: null, data: null };
  private laneRgb: RGB[] = [];
  private readonly state: TileState = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, opacity: 1 };

  private readonly overlayCtx: CanvasRenderingContext2D | null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLCanvasElement | null = null,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.overlayCtx = overlay?.getContext('2d') ?? null;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.overlay) {
      this.overlay.width = this.canvas.width;
      this.overlay.height = this.canvas.height;
      this.overlay.style.width = `${w}px`;
      this.overlay.style.height = `${h}px`;
    }
  }

  /** The finished frame (for the screen-filter pass). */
  get frame(): HTMLCanvasElement {
    return this.canvas;
  }

  private floorMarks(model: ChartModel): FloorMarks {
    if (this.marks.model !== model) {
      this.marks = { model, data: floorMarks(model) };
      this.laneRgb = model.lanes.map((l) => parseCss(laneColor(l)));
    }
    return this.marks.data!;
  }

  /**
   * Adds the outline of one tile to the current path: two half-tile arms (towards the previous
   * and the next tile) with flat ends at the joints. Wide turns get a mitred corner; sharp turns
   * and full turn-backs get a round back (separate sub-paths that the fill merges); single-arm
   * tiles get a round end and midspins a pointed one. All sub-paths share one winding.
   */
  private tilePath(
    x: number,
    y: number,
    entry: number,
    exit: number,
    len: number,
    h: number,
    midspin: boolean,
    dirOf: (a: number) => [number, number],
    unit: number,
  ): void {
    const c = this.ctx;
    c.beginPath();
    const rect = (ux: number, uy: number) => {
      // arm from the centre towards (ux, uy), clockwise on screen
      const nx = -uy;
      const ny = ux;
      const ex = x + ux * len;
      const ey = y + uy * len;
      c.moveTo(ex + nx * h, ey + ny * h);
      c.lineTo(x + nx * h, y + ny * h);
      c.lineTo(x - nx * h, y - ny * h);
      c.lineTo(ex - nx * h, ey - ny * h);
      c.closePath();
    };
    const roundBack = () => {
      c.moveTo(x + h, y);
      c.arc(x, y, h, 0, Math.PI * 2, false);
      c.closePath();
    };
    const hasIn = !Number.isNaN(entry);
    const hasOut = !Number.isNaN(exit);
    if (!hasIn && !hasOut) return roundBack();
    if (midspin && hasIn) {
      const [ux, uy] = dirOf(entry);
      const nx = -uy;
      const ny = ux;
      const ex = x + ux * MIDSPIN_REACH * unit;
      const ey = y + uy * MIDSPIN_REACH * unit;
      c.moveTo(ex + nx * h, ey + ny * h);
      c.lineTo(x + nx * h, y + ny * h);
      c.lineTo(x - ux * h * 1.15, y - uy * h * 1.15);
      c.lineTo(x - nx * h, y - ny * h);
      c.lineTo(ex - nx * h, ey - ny * h);
      c.closePath();
      return;
    }
    if (hasIn !== hasOut) {
      const [ux, uy] = dirOf(hasIn ? entry : exit);
      rect(ux, uy);
      return roundBack();
    }
    const [ax, ay] = dirOf(entry);
    const [bx, by] = dirOf(exit);
    const between = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
    if (between < 0.02) {
      // full turn-back (360°): a D standing apart, flat towards the joint and round away from it
      const nx = -ay;
      const ny = ax;
      const bx0 = x + ax * TURN_BACK * unit;
      const by0 = y + ay * TURN_BACK * unit;
      const cx = x - ax * TURN_CAP * unit;
      const cy = y - ay * TURN_CAP * unit;
      c.moveTo(bx0 + nx * h, by0 + ny * h);
      c.lineTo(cx + nx * h, cy + ny * h);
      c.lineTo(cx - nx * h, cy - ny * h);
      c.lineTo(bx0 - nx * h, by0 - ny * h);
      c.closePath();
      c.moveTo(cx + h, cy);
      c.arc(cx, cy, h, 0, Math.PI * 2, false);
      c.closePath();
      return;
    }
    if (between < ROUND_BELOW) {
      rect(ax, ay);
      rect(bx, by);
      return roundBack();
    }
    // mitred elbow: walk from the entry joint through the centre to the exit joint
    const n1x = ay;
    const n1y = -ax;
    const n2x = -by;
    const n2y = bx;
    const k = 1 + n1x * n2x + n1y * n2y;
    const mx = (n1x + n2x) / k;
    const my = (n1y + n2y) / k;
    const miter = k > 1e-6 && Math.hypot(mx, my) <= MITER_LIMIT;
    const pAx = x + ax * len;
    const pAy = y + ay * len;
    const pBx = x + bx * len;
    const pBy = y + by * len;
    c.moveTo(pAx + h * n1x, pAy + h * n1y);
    if (miter) c.lineTo(x + h * mx, y + h * my);
    else {
      c.lineTo(x + h * n1x, y + h * n1y);
      c.lineTo(x + h * n2x, y + h * n2y);
    }
    c.lineTo(pBx + h * n2x, pBy + h * n2y);
    c.lineTo(pBx - h * n2x, pBy - h * n2y);
    if (miter) c.lineTo(x - h * mx, y - h * my);
    else {
      c.lineTo(x - h * n2x, y - h * n2y);
      c.lineTo(x - h * n1x, y - h * n1y);
    }
    c.lineTo(pAx - h * n1x, pAy - h * n1y);
    c.closePath();
  }

  draw(model: ChartModel, camera: CameraTimeline, time: number, opts: TrackDrawOptions): void {
    const c = this.ctx;
    const { track, effects: fx, timing, lanes, fingering } = model;
    const { tiles } = timing;
    const n = tiles.length - 1;
    const marks = this.floorMarks(model);
    const view = camera.at(time);
    const vfx = opts.vfx ?? null;
    const camX = view.x + (vfx ? vfx.shake[0] : 0);
    const camY = view.y + (vfx ? vfx.shake[1] : 0);
    const px = (this.h / VIEW_TILES) * (100 / view.zoom) * (opts.scale / 100);
    const pxUnzoomed = (this.h / VIEW_TILES) * (opts.scale / 100);
    const rot = (-view.rotation * Math.PI) / 180;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const cx0 = opts.centerX ?? this.w / 2;
    const cy0 = this.h / 2;
    const sx = (wx: number, wy: number) => cx0 + ((wx - camX) * cr - (wy - camY) * sr) * px;
    const sy = (wx: number, wy: number) => cy0 - ((wx - camX) * sr + (wy - camY) * cr) * px;
    const dirOf = (a: number): [number, number] => [
      Math.cos(a) * cr - Math.sin(a) * sr,
      -(Math.cos(a) * sr + Math.sin(a) * cr),
    ];
    // Practice: the planet stands on the last floor you have played (hit or missed) and waits for the
    // next press, however early or late it comes.
    const judge = opts.play ?? null;
    let k = floorAt(timing, time);
    let open = -1;
    if (judge) {
      open = judge.pending();
      const landed = open > 0 ? timing.notes[open - 1]!.floor : 0;
      const next = open < timing.notes.length ? timing.notes[open]!.floor : Infinity;
      k = Math.max(landed, Math.min(k, next - 1));
    }
    const deg = Math.PI / 180;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    const bgLevel = fx.backgroundColor;
    const bg: RGB = bgLevel[0] + bgLevel[1] + bgLevel[2] === 0 ? [12, 12, 14] : bgLevel;
    c.fillStyle = css(bg);
    c.fillRect(0, 0, this.w, this.h);
    if (vfx) {
      const b = vfx.background;
      if (b.color[0] + b.color[1] + b.color[2] > 0 || b.image) {
        c.fillStyle = rgba(b.color);
        c.fillRect(0, 0, this.w, this.h);
      }
      if (b.image && opts.images)
        this.drawBackgroundImage(b, opts.images, camX, camY, rot, px, cx0, cy0, sx, sy);
      if (vfx.flashBack) {
        c.fillStyle = rgba(vfx.flashBack);
        c.fillRect(0, 0, this.w, this.h);
      }
    }

    // planets first (decorations can follow them), drawn after the tiles
    const planetEase = opts.planetEase ? model.vfx.planetProgress : undefined;
    const pl = judge
      ? planetsOn(timing, track, k, time, planetEase)
      : planetsAt(timing, track, time, planetEase);
    let pivotX = pl.pivotX;
    let pivotY = pl.pivotY;
    if (opts.effects) {
      const at = fx.stickToFloors ? time : timing.tiles[pl.floor]!.time;
      const st = tileStateAt(fx, pl.floor, at, this.state);
      pivotX += st.dx;
      pivotY += st.dy;
    }
    const pa = pl.angle * (Math.PI / 180);
    const otherX = pivotX + Math.cos(pa);
    const otherY = pivotY + Math.sin(pa);
    const red: [number, number] = pl.pivotPlanet === 0 ? [pivotX, pivotY] : [otherX, otherY];
    const blue: [number, number] = pl.pivotPlanet === 0 ? [otherX, otherY] : [pivotX, pivotY];

    // Decorations sit between the background (and its flash) and the track: tiles and planets are always
    // in front, whatever the depth (Feral #1487's depth −1 black bars and #582's depth 0 box are behind
    // them in the game). Depth only orders decorations among themselves, lower in front.
    if (opts.decorations && opts.images) {
      const decos = model.decorations
        .at(time)
        .filter((d) => d.visible && d.opacity * d.color[3] > 0.004 && d.sx !== 0 && d.sy !== 0)
        .sort((a, b) => b.deco.depth - a.deco.depth || a.deco.index - b.deco.index);
      this.drawDecorations(decos, {
        camX,
        camY,
        rot,
        px,
        pxUnzoomed,
        sx,
        sy,
        red,
        blue,
        images: opts.images,
      });
    }

    const nextNoteIdx = judge ? open : upperBound(timing.noteTimes, time + 1e-4);
    const lastLabelled = nextNoteIdx + 64;
    const margin = px * 1.2;
    const from = Math.max(0, k - 400);
    const to = Math.min(n, k + 1600);
    c.lineJoin = 'miter';
    c.miterLimit = MITER_LIMIT;

    const drawn: Drawn[] = [];

    // Later tiles first, so earlier ones (the ones the planet reaches first) sit on top, as in the game.
    for (let f = to; f >= from; f--) {
      let alpha = track.baseOpacity[f]!;
      let ax = 0;
      let ay = 0;
      let spin = 0;
      let scale = track.baseScale[f]!;
      if (opts.effects) {
        const st = tileStateAt(fx, f, time, this.state);
        const app = tileAppearance(fx, f, time);
        alpha *= st.opacity * app.alpha;
        scale *= ((st.sx + st.sy) / 2) * app.scale;
        ax = st.dx + app.dx;
        ay = st.dy + app.dy;
        spin = st.rot + app.spin;
      }
      if (alpha < 0.02 || scale < 0.02) continue;
      const wx = track.x[f]! + ax;
      const wy = track.y[f]! + ay;
      const x = sx(wx, wy);
      const y = sy(wx, wy);
      if (x < -margin || x > this.w + margin || y < -margin || y > this.h + margin) continue;

      let fill: RGB;
      let style = 'Standard';
      const ni = marks.note[f]!;
      if (opts.colorMode === 'finger') {
        const lane = ni >= 0 ? fingering.noteLane[ni]! : -1;
        fill = lane >= 0 && !model.noteAuto[ni] ? this.laneRgb[lane]! : [150, 156, 166];
      } else {
        const look = opts.effects ? tileLook(fx, f, time) : fx.looks[fx.lookBase[f]!]!;
        fill = lookColor(look, f, time);
        style = look.style;
      }
      let { body, rim, glow } = tileColors(style, fill, bg);
      if (f < k) {
        // passed tiles: darker instead of translucent so stacked tiles keep clean edges
        body = mix(body, bg, 0.45);
        rim = mix(rim, bg, 0.45);
        glow = false;
      }

      const r0 = (track.baseRot[f]! + spin) * deg;
      const entry = f > 0 ? (track.dir[f - 1]! + 180) * deg + r0 : Number.NaN;
      const midspin = f < n && tiles[f]!.isMidspin;
      const exit = f < n && !midspin ? track.dir[f]! * deg + r0 : Number.NaN;
      const h = (TRACK_W / 2) * scale * px;
      const outline = Math.max(1, OUTLINE * scale * px);
      c.globalAlpha = alpha;
      this.tilePath(x, y, entry, exit, ARM * scale * px, h, midspin, dirOf, scale * px);
      if (glow) {
        c.strokeStyle = css(fill, 0.22);
        c.lineWidth = outline * 2 + 0.14 * scale * px;
        c.stroke();
      }
      // rim first, body on top: the body hides the inner half of the rim and any inner seams
      c.strokeStyle = css(rim);
      c.lineWidth = outline * 2;
      c.stroke();
      c.fillStyle = css(body);
      c.fill('nonzero');

      // event icons sit in the tile centre, under the tiles that come earlier
      const size = 0.36 * scale * px;
      if (size >= 6 && (marks.twirl[f] || marks.speed[f])) {
        c.lineCap = 'round';
        if (marks.twirl[f]) {
          c.strokeStyle = f < k ? 'rgba(143,123,255,0.45)' : '#8f7bff';
          c.lineWidth = Math.max(1.4, size * 0.13);
          c.beginPath();
          for (let i = 0; i <= 40; i++) {
            const u = i / 40;
            const ang = u * 2.2 * Math.PI * 2;
            const rr = (size / 2) * u;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
          }
          c.stroke();
        } else {
          const faster = marks.speed[f]! > 0;
          c.strokeStyle = faster ? '#ff5a5a' : '#4f8bff';
          c.globalAlpha = alpha * (f < k ? 0.45 : 1);
          c.lineWidth = Math.max(1.6, size * 0.16);
          const d = faster ? 1 : -1;
          for (const off of [-0.22, 0.22]) {
            c.beginPath();
            c.moveTo(x + (off - 0.18 * d) * size, y - 0.3 * size);
            c.lineTo(x + (off + 0.18 * d) * size, y);
            c.lineTo(x + (off - 0.18 * d) * size, y + 0.3 * size);
            c.stroke();
          }
        }
        c.lineCap = 'butt';
      }
      drawn.push({ f, x, y, s: scale, alpha });
    }

    // Planets: the pivot lands where its tile is at that moment, and keeps following the tile only
    // when the level sticks planets to floors.
    c.globalAlpha = 1;
    const ox = otherX;
    const oy = otherY;
    const planet = (wx: number, wy: number, color: string) => {
      const x = sx(wx, wy);
      const y = sy(wx, wy);
      const r = Math.max(4, PLANET_R * px);
      const g = c.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
      g.addColorStop(0, color);
      g.addColorStop(0.45, color + '55');
      g.addColorStop(1, color + '00');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r * 2.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    };
    planet(pivotX, pivotY, pl.pivotPlanet === 0 ? FIRE : ICE);
    planet(ox, oy, pl.pivotPlanet === 0 ? ICE : FIRE);

    if (vfx?.flashFront) {
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.globalAlpha = 1;
      c.fillStyle = rgba(vfx.flashFront);
      c.fillRect(0, 0, this.w, this.h);
    }

    // Finger badges (our overlay), again earliest on top. They go on their own canvas when there is
    // one, so screen filters and flashes never change the finger colours.
    const b = this.overlayCtx ?? c;
    if (this.overlayCtx) {
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, this.overlay!.width, this.overlay!.height);
    }
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    for (const d of drawn) {
      const { f, x, y } = d;
      const ni = marks.note[f]!;
      // only notes still to play: the badge of the tile a planet already stands on would cover it
      if (!opts.labels || ni < nextNoteIdx || ni >= lastLabelled || model.noteAuto[ni]) continue;
      const lane = fingering.noteLane[ni]!;
      const ln = lanes[lane];
      if (!ln) continue;
      b.globalAlpha = d.alpha;
      const hasIcon = marks.twirl[f] || marks.speed[f];
      const r = Math.max(6, 0.15 * d.s * px);
      const bx = hasIcon ? x + 0.2 * d.s * px : x;
      const by = hasIcon ? y - 0.2 * d.s * px : y;
      if (opts.colorMode === 'level' || hasIcon) {
        b.fillStyle = laneColor(ln);
        b.beginPath();
        b.arc(bx, by, r, 0, Math.PI * 2);
        b.fill();
        b.strokeStyle = 'rgba(12,12,14,0.85)';
        b.lineWidth = 1.5;
        b.stroke();
      }
      if (r >= 7) {
        b.font = `700 ${Math.round(r * 1.25)}px ${FONT}`;
        b.fillStyle = 'rgba(16,14,18,0.92)';
        b.fillText(String(lane + 1), bx, by + 0.5);
      }
      if (ni === nextNoteIdx) {
        b.strokeStyle = '#ffffff';
        b.lineWidth = 2;
        b.beginPath();
        b.arc(bx, by, r + 4, 0, Math.PI * 2);
        b.stroke();
        b.font = `600 12px ${FONT}`;
        b.fillStyle = laneColor(ln);
        b.textAlign = 'left';
        b.fillText(laneLabel(ln), bx + r + 8, by - r - 4);
        b.textAlign = 'center';
      }
    }
    b.globalAlpha = 1;

    if (judge) this.drawJudgments(b, judge, model, drawn, time, px, sx(otherX, otherY), sy(otherX, otherY));
  }

  /** Judgment text floating up from the tiles just played, and "too early" over the moving planet. */
  private drawJudgments(
    b: CanvasRenderingContext2D,
    judge: Judge,
    model: ChartModel,
    drawn: Drawn[],
    time: number,
    px: number,
    planetX: number,
    planetY: number,
  ): void {
    const notes = model.timing.notes;
    const at = new Map<number, Drawn>();
    for (const d of drawn) at.set(d.f, d);
    const size = Math.max(12, Math.min(26, 0.3 * px));
    b.font = `800 ${Math.round(size)}px ${FONT}`;
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.lineJoin = 'round';
    const text = (label: string, color: string, x: number, y: number, age: number) => {
      b.globalAlpha = Math.max(0, 1 - age / PLAY_TEXT_S);
      const lift = (age / PLAY_TEXT_S) * 0.35 * px + 0.42 * px;
      b.lineWidth = Math.max(2, size * 0.18);
      b.strokeStyle = 'rgba(8,8,10,0.85)';
      b.strokeText(label, x, y - lift);
      b.fillStyle = color;
      b.fillText(label, x, y - lift);
    };
    const open = judge.pending();
    for (let i = Math.max(0, open - 24); i < Math.min(notes.length, open + 8); i++) {
      const age = time - judge.judgedAt[i]!;
      if (!(age >= 0 && age < PLAY_TEXT_S)) continue;
      const code = judge.result[i] as JudgeCode;
      const color = PLAY_COLOR[code];
      const tile = at.get(notes[i]!.floor);
      if (!color || !tile) continue;
      text(judgeLabel(code, judge.offsetMs[i]!), color, tile.x, tile.y, age);
    }
    const early = time - judge.tooEarly.at;
    if (early >= 0 && early < PLAY_TEXT_S)
      text(judgeLabel(JUDGE.tooEarly, 0), PLAY_COLOR[JUDGE.tooEarly]!, planetX, planetY, early);
    b.globalAlpha = 1;
  }

  /** The level's background image: covering the screen, at world size, or tiled, with parallax. */
  private drawBackgroundImage(
    b: VfxState['background'],
    images: LevelImages,
    camX: number,
    camY: number,
    rot: number,
    px: number,
    cx0: number,
    cy0: number,
    sx: (x: number, y: number) => number,
    sy: (x: number, y: number) => number,
  ): void {
    const img = images.getTinted(b.image, b.imageColor[0], b.imageColor[1], b.imageColor[2]);
    if (!img) return;
    const c = this.ctx;
    const iw = (img as { width: number }).width;
    const ih = (img as { height: number }).height;
    c.save();
    c.globalAlpha = b.imageColor[3];
    if (b.mode === 'Unscaled' || b.mode === 'Tiled') {
      const tw = (iw / DECORATION_PX_PER_TILE) * (b.unscaledSize / 100) * px;
      const th = (ih / DECORATION_PX_PER_TILE) * (b.unscaledSize / 100) * px;
      const wx = camX * (b.parallax[0] / 100);
      const wy = camY * (b.parallax[1] / 100);
      const ax = sx(wx, wy);
      const ay = sy(wx, wy);
      const r = b.lockRot ? 0 : rot;
      c.translate(ax, ay);
      c.rotate(-r);
      if (b.mode === 'Unscaled' && !b.loop) {
        c.drawImage(img, -tw / 2, -th / 2, tw, th);
      } else if (tw > 2 && th > 2) {
        // repeat around the anchor (Tiled, or Unscaled with loopBG) far enough to cover the turned view
        const dx = cx0 - ax;
        const dy = cy0 - ay;
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        const reach = Math.hypot(this.w, this.h);
        const i0 = Math.floor((lx - reach) / tw + 0.5);
        const i1 = Math.ceil((lx + reach) / tw + 0.5);
        const j0 = Math.floor((ly - reach) / th + 0.5);
        const j1 = Math.ceil((ly + reach) / th + 0.5);
        if ((i1 - i0) * (j1 - j0) <= 900)
          for (let i = i0; i <= i1; i++)
            for (let j = j0; j <= j1; j++) c.drawImage(img, (i - 0.5) * tw, (j - 0.5) * th, tw, th);
      }
    } else {
      // FitToScreen (and anything else): cover the view
      const k = Math.max(this.w / iw, this.h / ih);
      c.drawImage(img, (this.w - iw * k) / 2, (this.h - ih * k) / 2, iw * k, ih * k);
    }
    c.restore();
  }

  /** Decoration images and text, already sorted back to front. */
  private drawDecorations(
    list: DecorationState[],
    v: {
      camX: number;
      camY: number;
      rot: number;
      px: number;
      pxUnzoomed: number;
      sx: (x: number, y: number) => number;
      sy: (x: number, y: number) => number;
      red: [number, number];
      blue: [number, number];
      images: LevelImages;
    },
  ): void {
    const c = this.ctx;
    for (const d of list) {
      let wx: number;
      let wy: number;
      if (d.anchor === 'redPlanet' || d.anchor === 'bluePlanet') {
        const p = d.anchor === 'redPlanet' ? v.red : v.blue;
        wx = p[0] + d.x;
        wy = p[1] + d.y;
      } else if (d.anchor === 'camera') {
        wx = v.camX + d.x;
        wy = v.camY + d.y;
      } else {
        wx = d.x + (v.camX - d.ref[0]) * (d.parallax[0] / 100);
        wy = d.y + (v.camY - d.ref[1]) * (d.parallax[1] / 100);
      }
      const x = v.sx(wx, wy);
      const y = v.sy(wx, wy);
      const unit = d.deco.lockScale ? v.pxUnzoomed : v.px;
      let w: number;
      let h: number;
      let img: CanvasImageSource | null = null;
      if (d.deco.kind === 'image') {
        img = v.images.getTinted(d.image, d.color[0], d.color[1], d.color[2]);
        if (!img) continue;
        w = ((img as { width: number }).width / DECORATION_PX_PER_TILE) * Math.abs(d.sx) * unit;
        h = ((img as { height: number }).height / DECORATION_PX_PER_TILE) * Math.abs(d.sy) * unit;
      } else {
        w = h = 0.6 * Math.abs(d.sy) * unit;
      }
      const reach =
        Math.max(w * d.deco.tile[0], h * d.deco.tile[1]) +
        Math.hypot(d.deco.pivot[0] * d.sx, d.deco.pivot[1] * d.sy) * unit;
      if (x < -reach || x > this.w + reach || y < -reach || y > this.h + reach) continue;

      c.save();
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.globalAlpha = Math.min(1, d.opacity * d.color[3]);
      c.globalCompositeOperation = BLENDS[d.deco.blend] ?? 'source-over';
      c.imageSmoothingEnabled = d.deco.smooth;
      c.translate(x, y);
      const r = (d.rotation * Math.PI) / 180 + (d.deco.lockRotation ? 0 : v.rot);
      c.rotate(-r);
      // the pivot offset moves the image away from its position in the decoration's own (rotated, scaled)
      // space: Feral #1485's two 1000% bars with offset −1.2 end up 12 tiles to either side
      c.translate(d.deco.pivot[0] * d.sx * unit, -d.deco.pivot[1] * d.sy * unit);
      if (d.sx < 0 || d.sy < 0) c.scale(Math.sign(d.sx) || 1, Math.sign(d.sy) || 1);
      if (img) {
        const [tx, ty] = d.deco.tile;
        for (let i = 0; i < tx; i++)
          for (let j = 0; j < ty; j++) c.drawImage(img, (i - tx / 2) * w, (j - ty / 2) * h, w, h);
      } else if (d.text) {
        c.font = `${Math.max(1, h)}px ${FONTS[d.deco.font] ?? FONT}`;
        c.fillStyle = rgba(d.color, 1);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const lines = d.text.split('\n');
        lines.forEach((line, i) => c.fillText(line, 0, (i - (lines.length - 1) / 2) * h * 1.15));
      }
      c.restore();
    }
    c.imageSmoothingEnabled = true;
  }
}
