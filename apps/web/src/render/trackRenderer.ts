import type { CameraTimeline, TileState } from '@adofai-reading/core';
import {
  floorAt,
  laneLabel,
  lookColor,
  planetsAt,
  tileAppearance,
  tileLook,
  tileStateAt,
  upperBound,
} from '@adofai-reading/core';
import type { ChartModel } from '../chart/model';
import { laneColor } from './colors';

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
/** Tiles visible top to bottom at camera zoom 100 %. */
const VIEW_TILES = 6.5;
/** Track thickness, arm length, outline and planet radius in tile units (measured from game screenshots). */
const TRACK_W = 0.58;
const ARM = 0.5;
const OUTLINE = 0.03;
const PLANET_R = 0.21;
/** Turns sharper than this (angle between the two arms) get a round back, like the game's 15°–45° tiles. */
const ROUND_BELOW = (50 * Math.PI) / 180;
const MITER_LIMIT = 3;
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
}

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

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
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
      const ex = x + ux * len;
      const ey = y + uy * len;
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
    const px = (this.h / VIEW_TILES) * (100 / view.zoom) * (opts.scale / 100);
    const rot = (-view.rotation * Math.PI) / 180;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const cx0 = opts.centerX ?? this.w / 2;
    const cy0 = this.h / 2;
    const sx = (wx: number, wy: number) => cx0 + ((wx - view.x) * cr - (wy - view.y) * sr) * px;
    const sy = (wx: number, wy: number) => cy0 - ((wx - view.x) * sr + (wy - view.y) * cr) * px;
    const dirOf = (a: number): [number, number] => [
      Math.cos(a) * cr - Math.sin(a) * sr,
      -(Math.cos(a) * sr + Math.sin(a) * cr),
    ];
    const k = floorAt(timing, time);
    const deg = Math.PI / 180;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bgLevel = fx.backgroundColor;
    const bg: RGB = bgLevel[0] + bgLevel[1] + bgLevel[2] === 0 ? [12, 12, 14] : bgLevel;
    c.fillStyle = css(bg);
    c.fillRect(0, 0, this.w, this.h);

    const nextNoteIdx = upperBound(timing.noteTimes, time + 1e-4);
    const lastLabelled = nextNoteIdx + 64;
    const margin = px * 1.2;
    const from = Math.max(0, k - 400);
    const to = Math.min(n, k + 1600);
    c.lineJoin = 'miter';
    c.miterLimit = MITER_LIMIT;

    interface Drawn {
      f: number;
      x: number;
      y: number;
      s: number;
      alpha: number;
    }
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
      this.tilePath(x, y, entry, exit, ARM * scale * px, h, midspin, dirOf);
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

    // Finger badges (our overlay), again earliest on top
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const d of drawn) {
      const { f, x, y } = d;
      const ni = marks.note[f]!;
      if (!opts.labels || ni < 0 || f < k || ni >= lastLabelled || model.noteAuto[ni]) continue;
      const lane = fingering.noteLane[ni]!;
      const ln = lanes[lane];
      if (!ln) continue;
      c.globalAlpha = d.alpha;
      const hasIcon = marks.twirl[f] || marks.speed[f];
      const r = Math.max(6, 0.15 * d.s * px);
      const bx = hasIcon ? x + 0.2 * d.s * px : x;
      const by = hasIcon ? y - 0.2 * d.s * px : y;
      if (opts.colorMode === 'level' || hasIcon) {
        c.fillStyle = laneColor(ln);
        c.beginPath();
        c.arc(bx, by, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(12,12,14,0.85)';
        c.lineWidth = 1.5;
        c.stroke();
      }
      if (r >= 7) {
        c.font = `700 ${Math.round(r * 1.25)}px ${FONT}`;
        c.fillStyle = 'rgba(16,14,18,0.92)';
        c.fillText(String(lane + 1), bx, by + 0.5);
      }
      if (ni === nextNoteIdx) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(bx, by, r + 4, 0, Math.PI * 2);
        c.stroke();
        c.font = `600 12px ${FONT}`;
        c.fillStyle = laneColor(ln);
        c.textAlign = 'left';
        c.fillText(laneLabel(ln), bx + r + 8, by - r - 4);
        c.textAlign = 'center';
      }
    }
    c.globalAlpha = 1;

    // Planets: the pivot lands where its tile is at that moment, and keeps following the tile only
    // when the level sticks planets to floors.
    const pl = planetsAt(timing, track, time);
    let pivotX = pl.pivotX;
    let pivotY = pl.pivotY;
    if (opts.effects) {
      const at = fx.stickToFloors ? time : timing.tiles[pl.floor]!.time;
      const st = tileStateAt(fx, pl.floor, at, this.state);
      pivotX += st.dx;
      pivotY += st.dy;
    }
    const a = pl.angle * deg;
    const ox = pivotX + Math.cos(a);
    const oy = pivotY + Math.sin(a);
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
  }
}
