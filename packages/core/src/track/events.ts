import type { Level, LevelAction } from '../parse/level';
import { num } from '../parse/level';

/** Events that only make sense once (or are handled elsewhere) and are never repeated. */
const NOT_REPEATED = new Set([
  'RepeatEvents',
  'SetConditionalEvents',
  'PositionTrack',
  'Twirl',
  'SetSpeed',
  'Pause',
  'Hold',
]);

/** Space-separated tag list of an event ("" → none). */
export function tagsOf(v: unknown): string[] {
  return typeof v === 'string' ? v.split(/\s+/).filter(Boolean) : [];
}

/** Does an event's eventTag match a RepeatEvents tag list ("" matches untagged events)? */
function matches(eventTag: unknown, tags: string[]): boolean {
  const own = tagsOf(eventTag);
  if (!tags.length) return own.length === 0;
  return own.some((t) => tags.includes(t));
}

/** RepeatEvents on the same floor that name one of an event's tags. */
function repeatersOf(a: LevelAction, floorEvents: LevelAction[]): LevelAction[] {
  const own = tagsOf(a.eventTag);
  return floorEvents.filter(
    (r) => r.eventType === 'RepeatEvents' && r.active !== false && tagsOf(r.tag).some((t) => own.includes(t)),
  );
}

/**
 * Untagged events run on their floor. A tagged event waits to be triggered: by a RepeatEvents on the
 * same floor naming one of its tags, or by a judgment (SetConditionalEvents) or a decoration hitbox,
 * which we cannot know. Levels keep trigger-only events tagged on floor 1 (Timeline's "유다희" death
 * effect) and switch events off with a tag nobody uses (Feral's "none"). A repeated event also runs at
 * its own time unless every RepeatEvents naming it says executeOnCurrentFloor: false.
 */
function triggers(a: LevelAction, floorEvents: LevelAction[]): { repeated: boolean; now: boolean } {
  if (!tagsOf(a.eventTag).length || a.eventType === 'RepeatEvents') return { repeated: true, now: true };
  const reps = repeatersOf(a, floorEvents);
  return { repeated: reps.length > 0, now: reps.some((r) => r.executeOnCurrentFloor !== false) };
}

/** A cap so a level cannot unroll into millions of events. */
const MAX_COPIES = 20000;

const cache = new WeakMap<Level, LevelAction[][]>();

/**
 * The level's events per floor with RepeatEvents unrolled. A repeat of the events on the same floor
 * whose eventTag matches is a copy delayed by `interval` beats (angleOffset + interval × 180°), or for
 * repeatType "Floor" the same event `floorCount` floors later. Tagged events nothing repeats are left
 * out (see triggers). Every timed effect reads this list.
 */
export function levelEvents(level: Level): LevelAction[][] {
  const hit = cache.get(level);
  if (hit) return hit;
  const byFloor = level.actionsByFloor.map((list) => list.filter((a) => triggers(a, list).repeated));
  const last = byFloor.length - 1;
  const out = level.actionsByFloor.map((list) => list.filter((a) => triggers(a, list).now));
  let copies = 0;
  byFloor.forEach((list, f) => {
    for (const rep of list) {
      if (rep.eventType !== 'RepeatEvents' || rep.active === false) continue;
      const tags = tagsOf(rep.tag);
      const targets = list.filter(
        (a) => !NOT_REPEATED.has(a.eventType) && a.active !== false && matches(a.eventTag, tags),
      );
      const times = Math.max(0, Math.trunc(num(rep.repetitions, 1)));
      const byFloors = rep.repeatType === 'Floor';
      const interval = num(rep.interval, 1);
      const floorCount = Math.max(1, Math.trunc(num(rep.floorCount, 1)));
      for (let k = 1; k <= times && copies < MAX_COPIES; k++) {
        for (const a of targets) {
          if (byFloors) {
            const g = f + k * floorCount;
            if (g > last) break;
            out[g]!.push({ ...a, floor: g });
          } else {
            out[f]!.push({ ...a, angleOffset: num(a.angleOffset, 0) + k * interval * 180 });
          }
          copies++;
        }
      }
    }
  });
  cache.set(level, out);
  return out;
}
