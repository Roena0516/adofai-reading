import type { Level } from '../parse/level';
import { num, toBool } from '../parse/level';
import { MIDSPIN } from '../parse/pathData';
import { mod } from '../util/math';

export interface Tile {
  floor: number;
  /** Exit direction in degrees, MIDSPIN for a midspin, NaN for the last floor. */
  angle: number;
  isMidspin: boolean;
  /** BPM of the rotation that starts on this floor. */
  bpm: number;
  clockwise: boolean;
  /** Direction (degrees) the orbiting planet starts from on this floor. */
  entry: number;
  /** Song time (s) at which the planet lands on this floor. */
  time: number;
  /** Rotation from this floor to the next, in degrees (0 for midspins). */
  rotation: number;
  /** Length of the rotation starting here, in beats of `bpm` (rotation/180 + pause + hold). */
  beats: number;
  /** Same length in seconds. */
  duration: number;
  pauseBeats: number;
  holdTurns: number;
  autoplay: boolean;
  planets: number;
}

export interface Note {
  id: number;
  floor: number;
  /** Song time (s) of the press. */
  time: number;
  /** BPM of the rotation that leads into this note. */
  bpm: number;
  /** Release time for hold notes, otherwise null. */
  endTime: number | null;
  autoplay: boolean;
}

export interface Timing {
  tiles: Tile[];
  notes: Note[];
  /** Sorted note times, handy for binary searches. */
  noteTimes: Float64Array;
  warnings: string[];
  /** Time of the last floor. */
  endTime: number;
}

const HOLD_WARNING = 'Hold(롱노트) 이벤트가 있습니다. 길이 1 = 한 바퀴(2박)로 추정해 처리했습니다.';
const PLANET_WARNING = '3행성(MultiPlanet) 구간이 있습니다. 해당 구간의 타이밍은 정확하지 않을 수 있습니다.';
const FREEROAM_WARNING = 'FreeRoam 구간은 지원하지 않습니다. 이후 타이밍이 어긋날 수 있습니다.';

function parsePlanets(v: unknown): number {
  if (typeof v === 'string') return /three/i.test(v) ? 3 : 2;
  return num(v, 2);
}

/**
 * Compute when the planet lands on every floor.
 *
 * Floor f's exit direction is `angles[f]`; the rotation that starts on floor f goes from the
 * incoming direction (previous exit + 180°) to `angles[f]`, clockwise unless twirled.
 * 180° of rotation is one beat. A midspin floor rotates 0° and its follower is not a separate press.
 *
 * `settings.offset` is the song time at which the orbiting planet passes 0° (pointing right).
 * The planet starts at 180° one beat earlier, so floor 1 is hit exactly at the offset only when
 * the first tile is straight; a 90° first tile is hit half a beat earlier.
 * This was confirmed by aligning note times with the songs' audio onsets.
 */
export function computeTiming(level: Level): Timing {
  const { angles, actionsByFloor, settings } = level;
  const n = angles.length;
  const warnings = new Set<string>();
  const tiles: Tile[] = new Array(n + 1);

  let bpm = settings.bpm;
  let clockwise = true;
  let dirBefore = 180;
  let autoplay = false;
  let planets = 2;

  for (let f = 0; f <= n; f++) {
    let pause = 0;
    let hold = 0;
    for (const ev of actionsByFloor[f] ?? []) {
      if (ev.active === false) continue;
      switch (ev.eventType) {
        case 'SetSpeed': {
          if (ev.speedType === 'Multiplier') bpm *= num(ev.bpmMultiplier, 1);
          else bpm = num(ev.beatsPerMinute, bpm);
          break;
        }
        case 'Twirl':
          clockwise = !clockwise;
          break;
        case 'Pause':
          pause += num(ev.duration, 0);
          break;
        case 'Hold':
          hold += num(ev.duration, 0);
          warnings.add(HOLD_WARNING);
          break;
        case 'AutoPlayTiles':
          autoplay = toBool(ev.enabled, true);
          break;
        case 'MultiPlanet':
          planets = parsePlanets(ev.planets);
          if (planets !== 2) warnings.add(PLANET_WARNING);
          break;
        case 'FreeRoam':
          warnings.add(FREEROAM_WARNING);
          break;
      }
    }
    if (!(bpm > 0)) {
      warnings.add('BPM이 0 이하로 설정된 구간이 있어 무시했습니다.');
      bpm = tiles[f - 1]?.bpm ?? settings.bpm;
    }

    let angle = Number.NaN;
    let rotation = 0;
    let isMidspin = false;
    let nextDir = dirBefore;
    if (f < n) {
      angle = angles[f]!;
      if (angle === MIDSPIN) {
        isMidspin = true;
        let back = 1;
        while (f - back >= 0 && angles[f - back] === MIDSPIN) back++;
        const real = f - back >= 0 ? angles[f - back]! : 0;
        nextDir = mod(real + (back - 1) * 180, 360);
      } else {
        const delta = mod(dirBefore - angle, 360);
        rotation = clockwise ? delta : mod(360 - delta, 360);
        // Same direction in and out means a full turn; tiny values are float noise.
        if (rotation < 1e-3) rotation += 360;
        nextDir = mod(angle + 180, 360);
      }
    }
    const beats = f < n ? rotation / 180 + pause + hold * 2 : 0;
    tiles[f] = {
      floor: f,
      angle,
      isMidspin,
      bpm,
      clockwise,
      entry: dirBefore,
      time: 0,
      rotation,
      beats,
      duration: (beats * 60) / bpm,
      pauseBeats: pause,
      holdTurns: hold,
      autoplay,
      planets,
    };
    dirBefore = nextDir;
  }

  const offset = settings.offset / 1000;
  tiles[0]!.time = offset - 60 / tiles[0]!.bpm;
  for (let f = 0; f < n; f++) tiles[f + 1]!.time = tiles[f]!.time + tiles[f]!.duration;

  const notes: Note[] = [];
  let releaseFloor = -1;
  for (let k = 1; k <= n; k++) {
    if (angles[k - 1] === MIDSPIN) continue;
    if (k === releaseFloor) continue;
    const tile = tiles[k]!;
    const isHold = tile.holdTurns > 0 && k < n;
    if (isHold) releaseFloor = k + 1;
    notes.push({
      id: notes.length,
      floor: k,
      time: tile.time,
      bpm: tiles[k - 1]!.bpm,
      endTime: isHold ? tiles[k + 1]!.time : null,
      autoplay: tile.autoplay,
    });
  }

  return {
    tiles,
    notes,
    noteTimes: Float64Array.from(notes, (x) => x.time),
    warnings: [...warnings],
    endTime: tiles[n]!.time,
  };
}
