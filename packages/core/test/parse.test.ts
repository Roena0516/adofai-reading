import { describe, expect, it } from 'vitest';
import { MIDSPIN, parseLenientJson, parseLevel, pathDataToAngles, repairJson, toBool } from '../src';

describe('parseLenientJson', () => {
  it('accepts a BOM and trailing commas', () => {
    expect(parseLenientJson('﻿{"a": [1, 2, ], "b": {"c": 1,},}')).toEqual({ a: [1, 2], b: { c: 1 } });
  });

  it('escapes raw newlines inside strings', () => {
    expect(parseLenientJson('{"text": "line1\nline2", }')).toEqual({ text: 'line1\nline2' });
  });

  it('inserts missing commas between objects', () => {
    expect(JSON.parse(repairJson('{"actions": [ {"a": 1} {"a": 2} ]}'))).toEqual({
      actions: [{ a: 1 }, { a: 2 }],
    });
  });

  it('leaves commas inside strings alone', () => {
    expect(parseLenientJson('{"s": "a, ]", "t": 1,}')).toEqual({ s: 'a, ]', t: 1 });
  });
});

describe('pathDataToAngles', () => {
  it('maps absolute letters and midspins', () => {
    expect(pathDataToAngles('RULD!E')).toEqual([0, 90, 180, 270, MIDSPIN, 45]);
  });

  it('treats polygon characters as relative turns and warns', () => {
    const warnings: string[] = [];
    expect(pathDataToAngles('R5', warnings)).toEqual([0, 72]);
    expect(warnings.length).toBe(1);
  });
});

describe('parseLevel', () => {
  it('reads settings, both boolean styles, and groups actions by floor', () => {
    const lvl = parseLevel(
      JSON.stringify({
        angleData: [0, 90, 180],
        settings: {
          bpm: 200,
          offset: 500,
          separateCountdownTime: 'Disabled',
          artist: '<color=#fff>Plum</color>',
        },
        actions: [
          { floor: 1, eventType: 'Twirl' },
          { floor: 1, eventType: 'SetSpeed', speedType: 'Bpm', beatsPerMinute: 400 },
          { floor: 9, eventType: 'Twirl' },
        ],
      }),
    );
    expect(lvl.settings.bpm).toBe(200);
    expect(lvl.settings.artist).toBe('Plum');
    expect(lvl.settings.separateCountdownTime).toBe(false);
    expect(lvl.actionsByFloor[1]!.map((a) => a.eventType)).toEqual(['Twirl', 'SetSpeed']);
    expect(lvl.warnings.some((w) => w.includes('범위'))).toBe(true);
  });

  it('understands Enabled/Disabled strings', () => {
    expect(toBool('Enabled')).toBe(true);
    expect(toBool('Disabled', true)).toBe(false);
    expect(toBool(undefined, true)).toBe(true);
  });
});
