import type { FingeringProfile, KeyBase, RollStyle } from '@adofai-reading/core';
import {
  BASE_LABEL,
  BASE_TIERS,
  KEY_LAYOUTS,
  ROLL_STYLE_LABEL,
  buildLanes,
  keysForLayout,
  laneLabel,
  simpleOrder,
} from '@adofai-reading/core';
import { useMemo } from 'react';
import { useChart } from '../../chart/model';
import { laneColor } from '../../render/colors';
import { useLevelOverrides, useOverrides } from '../../stores/overrides';
import { usePlayer } from '../../stores/player';
import { useActiveProfile, useProfiles } from '../../stores/profiles';
import { Button, Field, KeyCapture, NumberField, Section, Segmented, Toggle, cx } from '../ui';

const STYLES: RollStyle[] = ['inout', 'outin', 'stairs'];
const STYLE_HINT: Record<RollStyle, string> = {
  inout: '각 손을 검지부터 바깥으로 (5643 · 567432 · 56784321)',
  outin: '각 손을 바깥 손가락부터 검지로 (6534 · 765234 · 87651234)',
  stairs: '주손은 검지→바깥, 이어서 반대 손은 바깥→검지 (5634 · 56781234)',
};
const BASE_HINT: Record<KeyBase, string> = {
  2: '8비트 이하는 주손 하나, 12·16비트는 양손 트릴, 24비트는 3키, 32비트는 4키, 48비트는 6키, 64비트 이상은 8키로 칩니다.',
  4: '8비트는 양손 트릴, 12비트는 3키, 16비트는 4키, 24비트는 6키, 32비트는 8키로 칩니다.',
};

/** Densities players name (12비트 = triplets); a tier row lists the ones it covers. */
const DENSITIES = [12, 16, 24, 32, 48, 64];

function tierLabel(base: KeyBase, i: number): string {
  const tiers = BASE_TIERS[base];
  const t = tiers[i]!;
  const prev = tiers[i - 1]?.upTo ?? 0;
  if (i === 0 && t.upTo != null) return `${t.upTo}비트 이하`;
  if (t.upTo == null) return `${DENSITIES.find((d) => d > prev) ?? prev}비트 이상`;
  const covered = DENSITIES.filter((d) => d > prev && d <= t.upTo!);
  return `${(covered.length ? covered : [t.upTo]).join('·')}비트`;
}

/**
 * The base BPM at the playhead: the tempo 16비트/32비트 are counted against. Edits go to the level's
 * sections, the same ones the 구간 tab shows.
 */
function BaseBpmField() {
  const model = useChart();
  const hash = model.loaded.hash;
  const ov = useLevelOverrides(hash);
  const patch = useOverrides((s) => s.patch);
  const time = usePlayer((s) => s.time);
  const sections = model.sections;
  let i = 0;
  while (i + 1 < sections.length && sections[i + 1]!.startTime <= time + 1e-6) i++;
  const sec = sections[i]!;
  const setBpm = (bpm: number) => {
    if (!(bpm > 0)) return;
    patch(hash, (o) => {
      const edits = o.sections ?? sections.map((s) => ({ floor: s.startFloor, bpm: +s.bpm.toFixed(3) }));
      return { ...o, sections: edits.map((e, k) => (k === i ? { ...e, bpm: +bpm.toFixed(3) } : e)) };
    });
  };
  return (
    <Section
      title="기준 BPM"
      aside={
        ov.sections ? (
          <Button size="sm" variant="ghost" onClick={() => patch(hash, (o) => ({ ...o, sections: null }))}>
            자동 감지로
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-center gap-2">
        <NumberField
          value={+sec.bpm.toFixed(3)}
          min={1}
          step={1}
          className="w-24"
          onChange={(v) => v != null && setBpm(v)}
        />
        <Button size="sm" onClick={() => setBpm(sec.bpm * 2)} title="두 배로 (16비트가 8비트로 읽힐 때)">
          ×2
        </Button>
        <Button size="sm" onClick={() => setBpm(sec.bpm / 2)} title="절반으로 (16비트가 32비트로 읽힐 때)">
          ÷2
        </Button>
        <span className="ml-auto text-xs text-dim">
          {sections.length > 1 ? `#${sec.startFloor}부터 · ${i + 1}/${sections.length}구간` : '레벨 전체'}
          {!ov.sections && ' · 자동'}
        </span>
      </div>
      <p className="text-xs leading-[1.6] text-dim">
        한 박의 길이입니다. 16비트·32비트 같은 연타 밀도와 정박이 이 BPM으로 정해집니다. 구간을 나누려면 구간
        탭에서 편집하세요.
      </p>
    </Section>
  );
}

/** Lane chips for an order, coloured by hand and finger. */
function OrderChips({ seq, lanes }: { seq: number[]; lanes: ReturnType<typeof buildLanes> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {seq.map((l, i) => {
        const ln = lanes[l];
        if (!ln) return null;
        return (
          <span
            key={i}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-canvas tabular"
            style={{ background: laneColor(ln) }}
            title={`${l + 1}번 레인`}
          >
            {laneLabel(ln)}
          </span>
        );
      })}
    </span>
  );
}

/** 타법: main hand, roll direction, 2키/4키 base, key bindings and 동타. */
export function ProfilePanel() {
  const profile = useActiveProfile();
  const update = useProfiles((s) => s.update);
  const lanes = useMemo(() => buildLanes(profile.fingers), [profile.fingers]);
  const edit = (fn: (p: FingeringProfile) => FingeringProfile) => update(profile.id, fn);
  const { style, base } = profile.simple;

  const keyCount = new Map<string, number>();
  profile.keys.forEach((k) => k && keyCount.set(k, (keyCount.get(k) ?? 0) + 1));

  return (
    <div className="space-y-6 p-4">
      <BaseBpmField />

      <Section title="손배치">
        <Field label="주손">
          <Segmented
            size="sm"
            value={profile.mainHand}
            onChange={(mainHand) => edit((p) => ({ ...p, mainHand }))}
            options={[
              { value: 'L', label: '왼손' },
              { value: 'R', label: '오른손' },
            ]}
          />
        </Field>
        <Field label="굴리는 방향" hint={STYLE_HINT[style]}>
          <Segmented
            size="sm"
            value={style}
            onChange={(next) => edit((p) => ({ ...p, mode: 'simple', simple: { ...p.simple, style: next } }))}
            options={STYLES.map((s) => ({ value: s, label: ROLL_STYLE_LABEL[s].replace(' (3412형)', '') }))}
          />
        </Field>
        <Field label="기반" hint={BASE_HINT[base]}>
          <Segmented
            size="sm"
            value={base}
            onChange={(next) => edit((p) => ({ ...p, mode: 'simple', simple: { ...p.simple, base: next } }))}
            options={([2, 4] as const).map((b) => ({ value: b, label: BASE_LABEL[b] }))}
          />
        </Field>
        <div className="overflow-hidden rounded-xl border border-border-soft">
          {BASE_TIERS[base].map((t, i) => (
            <div
              key={i}
              className={cx(
                'flex items-center justify-between gap-3 bg-surface px-3 py-2',
                i > 0 && 'border-t border-border-soft',
              )}
            >
              <span className="shrink-0 text-sm text-ink-2">
                {tierLabel(base, i)} <span className="text-dim">· {t.keys}키</span>
              </span>
              <OrderChips seq={simpleOrder(t.keys, style, profile.mainHand, lanes)} lanes={lanes} />
            </div>
          ))}
        </div>
        <Toggle
          label="1키 구간의 엇박은 반대 손"
          checked={profile.simple.offbeatOtherHand}
          onChange={(offbeatOtherHand) => edit((p) => ({ ...p, simple: { ...p.simple, offbeatOtherHand } }))}
        />
        <p className="-mt-1 text-xs leading-[1.6] text-dim">
          한 키로 치는 구간(2키 기반의 8비트 등)에서 90° 타일로 16분 엇박에 들어오는 노트를 반대 손으로
          칩니다. 정박은 주손, 엇박은 반대 손이 됩니다.
        </p>
        <p className="text-xs leading-[1.6] text-dim">
          연타가 기준 BPM 한 박에 몇 개인지(16비트 = 4개, 12비트 = 셋잇단)로 키 수를 고르고, 첫 손가락이
          강박에 오도록 순서를 돌립니다. 레벨의 한 구간만 다른 기반으로 치려면 일시정지한 뒤 레인 옆 카드의
          “여기부터”를 쓰세요.
        </p>
      </Section>

      <Section
        title="키 바인딩"
        aside={
          <select
            value=""
            onChange={(e) => {
              const layout = KEY_LAYOUTS[Number(e.target.value)];
              if (layout) edit((p) => ({ ...p, keys: keysForLayout(lanes, layout) }));
            }}
            className="field h-7 text-xs text-ink-soft"
          >
            <option value="">키배치 적용…</option>
            {KEY_LAYOUTS.map((l, i) => (
              <option key={l.name} value={i}>
                {l.name}
              </option>
            ))}
          </select>
        }
      >
        <div className="grid grid-cols-4 gap-2">
          {lanes.map((ln, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-medium tabular" style={{ color: laneColor(ln) }}>
                {i + 1} · {laneLabel(ln)}
              </span>
              <KeyCapture
                code={profile.keys[i] ?? ''}
                conflict={(keyCount.get(profile.keys[i] ?? '') ?? 0) > 1}
                onChange={(code) =>
                  edit((p) => {
                    const keys = [...p.keys];
                    while (keys.length < lanes.length) keys.push('');
                    keys[i] = code;
                    return { ...p, keys };
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="동타">
        <Field
          label="한손 동타 각도 (° 이하)"
          hint="이 각도 이하로 꺾이는 타일(30°, 15°)은 한 손의 이웃 손가락 두 개로 칩니다. 0이면 끕니다."
        >
          <NumberField
            value={profile.chord.oneHandAngle}
            min={0}
            max={180}
            step={5}
            className="w-20"
            onChange={(v) => v != null && edit((p) => ({ ...p, chord: { ...p.chord, oneHandAngle: v } }))}
          />
        </Field>
        <Toggle
          label="질주 중 90° 타일도 한 손으로"
          checked={profile.chord.streamDouble}
          onChange={(streamDouble) => edit((p) => ({ ...p, chord: { ...p.chord, streamDouble } }))}
        />
        {profile.chord.streamDouble && (
          <Field
            label="질주로 볼 최소 비트"
            hint="이 비트 이상 연타 중에 반 간격으로 들어오는 90° 쌍을 한 손으로 칩니다. 이 쌍은 동타 동시 표시를 켜도 실제 시각대로 그립니다."
          >
            <NumberField
              value={profile.chord.streamDoubleMinBeat}
              min={4}
              max={64}
              step={4}
              className="w-20"
              onChange={(v) =>
                v != null && edit((p) => ({ ...p, chord: { ...p.chord, streamDoubleMinBeat: v } }))
              }
            />
          </Field>
        )}
      </Section>
    </div>
  );
}
