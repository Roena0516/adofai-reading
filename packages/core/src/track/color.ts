/** How a stretch of track is coloured (ColorTrack / RecolorTrack / settings). */
export interface TrackLook {
  type: string;
  primary: [number, number, number];
  secondary: [number, number, number];
  /** Seconds per colour cycle for animated types. */
  animDuration: number;
  pulse: 'Forward' | 'Backward' | 'None';
  pulseLength: number;
  style: string;
}

export function parseHexColor(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (typeof v !== 'string') return fallback;
  const h = v.replace('#', '').trim();
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const DEFAULT_LOOK: TrackLook = {
  type: 'Single',
  primary: [222, 187, 123],
  secondary: [255, 255, 255],
  animDuration: 2,
  pulse: 'None',
  pulseLength: 10,
  style: 'Standard',
};

export function lookFrom(src: Record<string, unknown>, base: TrackLook = DEFAULT_LOOK): TrackLook {
  const pulse = src.trackColorPulse;
  return {
    type: typeof src.trackColorType === 'string' ? src.trackColorType : base.type,
    primary: parseHexColor(src.trackColor, base.primary),
    secondary: parseHexColor(src.secondaryTrackColor, base.secondary),
    animDuration:
      typeof src.trackColorAnimDuration === 'number' && src.trackColorAnimDuration > 0
        ? src.trackColorAnimDuration
        : base.animDuration,
    pulse: pulse === 'Forward' || pulse === 'Backward' || pulse === 'None' ? pulse : base.pulse,
    pulseLength:
      typeof src.trackPulseLength === 'number' && src.trackPulseLength > 0
        ? src.trackPulseLength
        : base.pulseLength,
    style: typeof src.trackStyle === 'string' ? src.trackStyle : base.style,
  };
}

function mix(a: [number, number, number], b: [number, number, number], u: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

/** Colour of a floor at song time t, following ADOFAI's track colour types closely enough to read. */
export function lookColor(look: TrackLook, floor: number, t: number): [number, number, number] {
  const phaseShift =
    look.pulse === 'None' ? 0 : (look.pulse === 'Forward' ? -1 : 1) * (floor / look.pulseLength);
  const cycle = t / look.animDuration + phaseShift;
  switch (look.type) {
    case 'Stripes':
      return floor % 2 === 0 ? look.primary : look.secondary;
    case 'Glow':
      return mix(look.primary, look.secondary, 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
    case 'Blink':
      return cycle - Math.floor(cycle) < 0.5 ? look.primary : look.secondary;
    case 'Switch':
      return (floor + Math.floor(cycle * 2)) % 2 === 0 ? look.primary : look.secondary;
    case 'Rainbow': {
      const [r, g, b] = look.primary;
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      return hsvToRgb(
        cycle - Math.floor(cycle),
        max > 0 ? Math.max(0.55, (max - min) / max) : 0.6,
        Math.max(0.75, max),
      );
    }
    default:
      return look.primary;
  }
}
