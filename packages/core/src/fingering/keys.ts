import type { Finger, Hand, Lane } from './layout';

export interface KeyLayout {
  name: string;
  keys: Record<Hand, Partial<Record<Finger, string>>>;
}

/** Common ADOFAI keyboard layouts (dcinside 불과 얼음의 춤 갤러리 키배치 정리 글). */
export const KEY_LAYOUTS: KeyLayout[] = [
  {
    name: 'A S D F · J K L ;',
    keys: {
      L: { pinky: 'KeyA', ring: 'KeyS', middle: 'KeyD', index: 'KeyF', thumb: 'Space' },
      R: { thumb: 'AltRight', index: 'KeyJ', middle: 'KeyK', ring: 'KeyL', pinky: 'Semicolon' },
    },
  },
  {
    name: 'Tab 1 2 E · P = ⌫ ₩',
    keys: {
      L: { pinky: 'Tab', ring: 'Digit1', middle: 'Digit2', index: 'KeyE', thumb: 'Space' },
      R: { thumb: 'AltRight', index: 'KeyP', middle: 'Equal', ring: 'Backspace', pinky: 'Backslash' },
    },
  },
  {
    name: 'Q W E F · K O P [',
    keys: {
      L: { pinky: 'KeyQ', ring: 'KeyW', middle: 'KeyE', index: 'KeyF', thumb: 'Space' },
      R: { thumb: 'AltRight', index: 'KeyK', middle: 'KeyO', ring: 'KeyP', pinky: 'BracketLeft' },
    },
  },
  {
    name: 'Z S D G · J O ; /',
    keys: {
      L: { pinky: 'KeyZ', ring: 'KeyS', middle: 'KeyD', index: 'KeyG', thumb: 'Space' },
      R: { thumb: 'AltRight', index: 'KeyJ', middle: 'KeyO', ring: 'Semicolon', pinky: 'Slash' },
    },
  },
];

export function keysForLayout(lanes: Lane[], layout: KeyLayout = KEY_LAYOUTS[0]!): string[] {
  return lanes.map((l) => layout.keys[l.hand][l.finger] ?? '');
}

const SPECIAL: Record<string, string> = {
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '₩',
  IntlYen: '¥',
  Equal: '=',
  Minus: '-',
  Backspace: '⌫',
  Space: 'Space',
  Tab: 'Tab',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Enter: 'Enter',
  CapsLock: 'Caps',
  ShiftLeft: 'LShift',
  ShiftRight: 'RShift',
  ControlLeft: 'LCtrl',
  ControlRight: 'RCtrl',
  AltLeft: 'LAlt',
  AltRight: 'RAlt',
  MetaLeft: 'LCmd',
  MetaRight: 'RCmd',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (SPECIAL[code]) return SPECIAL[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'N' + code.slice(6);
  return code;
}

/** Keep each finger's key when the finger set changes; new fingers get the default layout key. */
export function remapKeys(oldLanes: Lane[], oldKeys: string[], newLanes: Lane[]): string[] {
  const byFinger = new Map<string, string>();
  oldLanes.forEach((l, i) => {
    if (oldKeys[i]) byFinger.set(`${l.hand}-${l.finger}`, oldKeys[i]!);
  });
  const defaults = keysForLayout(newLanes);
  const used = new Set<string>();
  return newLanes.map((l, i) => {
    const kept = byFinger.get(`${l.hand}-${l.finger}`);
    const pick = kept ?? defaults[i] ?? '';
    if (pick && used.has(pick)) return '';
    used.add(pick);
    return pick;
  });
}
