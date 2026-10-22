import type { Band, ChordAssign, FingeringProfile, KeyCount, RollStyle } from '@adofai-reading/core';
import {
  KEY_COUNT_LABEL,
  KEY_LAYOUTS,
  PROFILE_PRESETS,
  ROLL_STYLE_LABEL,
  buildLanes,
  describeOrder,
  effectiveBands,
  formatOrder,
  keysForLayout,
  laneLabel,
  namedOrders,
  parseOrder,
  simpleOrder,
} from '@adofai-reading/core';
import { ChevronDown, Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadJson, pickJsonFile } from '../../lib/format';
import { laneColor } from '../../render/colors';
import { useActiveProfile, useProfiles } from '../../stores/profiles';
import {
  Button,
  ConfirmButton,
  Field,
  KeyCapture,
  NumberField,
  Section,
  Segmented,
  TextField,
  Toggle,
  cx,
} from '../ui';

const KEY_COUNTS: KeyCount[] = [1, 2, 4, 6, 8];
const STYLES: RollStyle[] = ['inout', 'outin', 'stairs'];
const STYLE_HINT: Record<RollStyle, string> = {
  inout: '각 손을 검지부터 바깥으로 (5643 · 567432 · 56784321)',
  outin: '각 손을 바깥 손가락부터 검지로 (6534 · 765234 · 87651234)',
  stairs: '주손은 검지→바깥, 이어서 반대 손은 바깥→검지 (5634 · 56781234)',
};

function tierLabel(tiers: FingeringProfile['simple']['tiers'], i: number): string {
  const t = tiers[i]!;
  const prev = i > 0 ? tiers[i - 1]!.upTo : null;
  if (t.upTo == null) return prev == null ? '전부' : `${prev}비트 초과`;
  if (i === 0) return `${t.upTo}비트 이하`;
  return `${t.upTo}비트`;
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

export function ProfilePanel() {
  const profile = useActiveProfile();
  const profiles = useProfiles((s) => s.profiles);
  const { update, createFromPreset, duplicate, remove, importProfiles } = useProfiles.getState();
  const [presetKey, setPresetKey] = useState(PROFILE_PRESETS[0]!.key);
  const [message, setMessage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const lanes = useMemo(() => buildLanes(profile.fingers), [profile.fingers]);
  const named = useMemo(() => namedOrders(lanes, profile.mainHand), [lanes, profile.mainHand]);
  const edit = (fn: (p: FingeringProfile) => FingeringProfile) => update(profile.id, fn);
  const custom = profile.mode === 'custom';
  // hand-edited bands kept from before (e.g. a migrated profile) that differ from the simple layout
  const savedDiffers = useMemo(() => {
    const gen = effectiveBands({ ...profile, mode: 'simple' })
      .bands.map((b) => `${b.upTo}:${b.order}`)
      .join('|');
    return profile.bands.length > 0 && profile.bands.map((b) => `${b.upTo}:${b.order}`).join('|') !== gen;
  }, [profile]);

  const keyCount = new Map<string, number>();
  profile.keys.forEach((k) => k && keyCount.set(k, (keyCount.get(k) ?? 0) + 1));

  const setBand = (i: number, patch: Partial<Band>) =>
    edit((p) => ({ ...p, bands: p.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) }));
  const addBand = () =>
    edit((p) => {
      const finite = p.bands.filter((b) => b.upTo != null).map((b) => b.upTo!);
      const top = finite.length ? Math.max(...finite) : 0;
      const step = p.speedUnit === 'bpm' ? 300 : 8;
      const last = p.bands[p.bands.length - 1];
      return { ...p, bands: [...p.bands, { upTo: top + step, order: last?.order ?? '5', anchor: null }] };
    });
  const startCustom = () =>
    edit((p) => {
      const eff = effectiveBands(p);
      return { ...p, mode: 'custom', bands: eff.bands, speedUnit: eff.speedUnit };
    });

  const exportProfile = () =>
    downloadJson(`${profile.name}.adofai-profile.json`, {
      format: 'adofai-reading/profile',
      version: 2,
      profile,
    });
  const importProfile = async () => {
    try {
      const data = (await pickJsonFile()) as { profile?: unknown; profiles?: unknown };
      const n = importProfiles(data.profile ?? data.profiles ?? data);
      setMessage(`프로필 ${n}개를 가져왔습니다.`);
    } catch (e) {
      setMessage(`가져오지 못했습니다: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <Section title="프로필">
        <div className="flex gap-2">
          <TextField
            value={profile.name}
            onCommit={(name) => edit((p) => ({ ...p, name }))}
            className="min-w-0 flex-1"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => duplicate(profile.id)}
            title="복제"
            aria-label="프로필 복제"
          >
            <Copy size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={exportProfile}
            title="내보내기"
            aria-label="프로필 내보내기"
          >
            <Download size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={importProfile}
            title="가져오기"
            aria-label="프로필 가져오기"
          >
            <Upload size={14} />
          </Button>
          {profiles.length > 1 && (
            <ConfirmButton onConfirm={() => remove(profile.id)} label="프로필 삭제">
              <Trash2 size={14} />
            </ConfirmButton>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value)}
            className="field min-w-0 flex-1"
          >
            {PROFILE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => createFromPreset(presetKey)}>
            <Plus size={14} /> 새 프로필
          </Button>
        </div>
        {message && <p className="text-xs text-accent-soft">{message}</p>}
      </Section>

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
        {custom ? (
          <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-3 text-sm text-ink-soft">
            <p className="m-0">고급 설정에서 직접 편집한 순서를 쓰고 있습니다.</p>
            <Button size="sm" onClick={() => edit((p) => ({ ...p, mode: 'simple' }))}>
              기본 손배치로 돌아가기
            </Button>
          </div>
        ) : (
          <>
            <Field label="굴리는 방향" hint={STYLE_HINT[profile.simple.style]}>
              <Segmented
                size="sm"
                value={profile.simple.style}
                onChange={(style) => edit((p) => ({ ...p, simple: { ...p.simple, style } }))}
                options={STYLES.map((s) => ({
                  value: s,
                  label: ROLL_STYLE_LABEL[s].replace(' (3412형)', ''),
                }))}
              />
            </Field>
            <div className="overflow-hidden rounded-xl border border-border-soft">
              {profile.simple.tiers.map((t, i) => {
                const seq = simpleOrder(t.keys, profile.simple.style, profile.mainHand, lanes);
                return (
                  <div
                    key={i}
                    className={cx(
                      'space-y-1.5 bg-surface px-3 py-2.5',
                      i > 0 && 'border-t border-border-soft',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink-2">{tierLabel(profile.simple.tiers, i)}</span>
                      <select
                        value={t.keys}
                        onChange={(e) =>
                          edit((p) => ({
                            ...p,
                            simple: {
                              ...p.simple,
                              tiers: p.simple.tiers.map((x, k) =>
                                k === i ? { ...x, keys: Number(e.target.value) as KeyCount } : x,
                              ),
                            },
                          }))
                        }
                        className="field h-7 text-xs"
                      >
                        {KEY_COUNTS.map((k) => (
                          <option key={k} value={k}>
                            {KEY_COUNT_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <OrderChips seq={seq} lanes={lanes} />
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-[1.6] text-dim">
              연타가 기준 BPM 한 박에 몇 개인지(16비트 = 한 박에 4개)로 키 수를 고릅니다. 위 순서를 한 바퀴씩
              돌리고, 첫 손가락이 연타의 강박에 오도록 맞춥니다.
            </p>
          </>
        )}
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

      <section>
        <button
          type="button"
          onClick={() => setAdvanced((x) => !x)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-xs font-medium tracking-[0.5px] text-accent-soft"
          aria-expanded={advanced}
        >
          고급 설정
          <ChevronDown size={14} className={cx('transition-transform', advanced && 'rotate-180')} />
        </button>
        {advanced && (
          <div className="mt-4 space-y-6">
            <Section
              title="순서 직접 편집"
              aside={
                custom ? (
                  <Segmented
                    size="sm"
                    value={profile.speedUnit}
                    onChange={(speedUnit) => edit((p) => ({ ...p, speedUnit }))}
                    options={[
                      { value: 'bpm', label: '실효 BPM', title: '연타 간격으로 계산한 속도 (질주 BPM)' },
                      { value: 'beat', label: '비트', title: '기준 BPM 한 박에 몇 개인지 × 4 (16비트 등)' },
                    ]}
                  />
                ) : undefined
              }
            >
              {!custom ? (
                <>
                  <p className="text-xs leading-[1.6] text-dim">
                    속도 구간 경계와 각 구간의 레인 순서(예: 5634, 3222322232232232처럼 노트별 표기도 가능)를
                    직접 정합니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={startCustom}>
                      지금 손배치에서 시작
                    </Button>
                    {savedDiffers && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => edit((p) => ({ ...p, mode: 'custom' }))}
                      >
                        저장된 순서 쓰기
                      </Button>
                    )}
                  </div>
                  {savedDiffers && (
                    <p className="m-0 text-xs text-dim">
                      저장된 순서:{' '}
                      {profile.bands
                        .map(
                          (b) => `${b.upTo ?? '∞'}${profile.speedUnit === 'bpm' ? 'BPM' : '비트'} ${b.order}`,
                        )
                        .join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    {profile.bands.map((b, i) => {
                      const parsed = parseOrder(b.order, lanes.length);
                      const isLast = i === profile.bands.length - 1;
                      return (
                        <div
                          key={i}
                          className="space-y-2 rounded-xl border border-border-soft bg-surface p-3"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-5 text-xs text-dim tabular">{i + 1}</span>
                            <span className="text-muted">≤</span>
                            {isLast && b.upTo == null ? (
                              <span className="w-20 text-ink-soft">끝까지</span>
                            ) : (
                              <NumberField
                                value={b.upTo}
                                min={0}
                                allowEmpty
                                className="w-20"
                                onChange={(upTo) => setBand(i, { upTo })}
                              />
                            )}
                            <span className="text-xs text-dim">
                              {profile.speedUnit === 'bpm' ? 'BPM' : '비트'}
                            </span>
                            {profile.bands.length > 1 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto"
                                aria-label="구간 삭제"
                                onClick={() =>
                                  edit((p) => ({ ...p, bands: p.bands.filter((_, k) => k !== i) }))
                                }
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <TextField
                              value={b.order}
                              live
                              invalid={!!parsed.error}
                              placeholder="예: 5643"
                              onCommit={(order) => setBand(i, { order: order.trim() })}
                              className="w-28 font-mono tracking-widest"
                            />
                            <select
                              value=""
                              onChange={(e) => {
                                const o = named.find((x) => x.key === e.target.value);
                                if (o) setBand(i, { order: formatOrder(o.seq) });
                              }}
                              className="field min-w-0 flex-1 text-xs text-ink-soft"
                            >
                              <option value="">이름으로 고르기…</option>
                              {named.map((o) => (
                                <option key={o.key} value={o.key}>
                                  {o.name} ({formatOrder(o.seq)})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cx(
                                'm-0 min-w-0 truncate text-xs',
                                parsed.error ? 'text-wrong' : 'text-muted',
                              )}
                            >
                              {parsed.error ?? describeOrder(parsed.seq, lanes)}
                            </p>
                            <select
                              value={b.anchor ?? ''}
                              title="연타의 가장 센 박을 칠 손가락"
                              onChange={(e) =>
                                setBand(i, { anchor: e.target.value ? Number(e.target.value) : null })
                              }
                              className="field h-7 shrink-0 text-xs text-ink-soft"
                            >
                              <option value="">강박: 첫 손가락</option>
                              {[...new Set(parsed.seq)].map((l) => (
                                <option key={l} value={l + 1}>
                                  강박: {l + 1} {lanes[l] ? laneLabel(lanes[l]) : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button size="sm" onClick={addBand}>
                    <Plus size={14} /> 구간 추가
                  </Button>
                </>
              )}
            </Section>

            <Section title="연타 규칙">
              <Field
                label="손 흐름"
                hint="쉼 없이 이어지면 속도가 바뀌어도 방금 친 손가락 다음부터 이어 칩니다."
              >
                <Segmented
                  size="sm"
                  value={profile.run.reanchor}
                  onChange={(reanchor) => edit((p) => ({ ...p, run: { ...p.run, reanchor } }))}
                  options={[
                    { value: 'rest', label: '이어 치기' },
                    { value: 'run', label: '연타마다 새로' },
                  ]}
                />
              </Field>
              <Field label="쉼으로 볼 길이 (박)">
                <NumberField
                  value={profile.run.restBeats}
                  min={0}
                  step={0.25}
                  className="w-20"
                  onChange={(v) => v != null && edit((p) => ({ ...p, run: { ...p.run, restBeats: v } }))}
                />
              </Field>
              <Field label="같은 손가락 최소 간격 (ms)">
                <NumberField
                  value={profile.run.sameFingerMinMs}
                  min={0}
                  max={1000}
                  step={10}
                  className="w-20"
                  onChange={(v) =>
                    v != null && edit((p) => ({ ...p, run: { ...p.run, sameFingerMinMs: v } }))
                  }
                />
              </Field>
              <Field label="첫 손가락 위치">
                <Segmented
                  size="sm"
                  value={profile.run.anchor}
                  onChange={(anchor) => edit((p) => ({ ...p, run: { ...p.run, anchor } }))}
                  options={[
                    { value: 'metric', label: '강박에 맞춤' },
                    { value: 'first', label: '첫 노트부터' },
                  ]}
                />
              </Field>
            </Section>

            <Section title="따닥 세부">
              <Field
                label="묶는 간격 (ms 이하)"
                hint="이보다 가까운 노트 2~4개는 한 번에 치는 따닥으로 봅니다."
              >
                <NumberField
                  value={profile.chord.thresholdMs}
                  min={0}
                  max={120}
                  className="w-20"
                  onChange={(v) =>
                    v != null && edit((p) => ({ ...p, chord: { ...p.chord, thresholdMs: v } }))
                  }
                />
              </Field>
              <Field label="손가락 고르기 (각도 동타가 아닐 때)">
                <select
                  value={profile.chord.assign}
                  onChange={(e) =>
                    edit((p) => ({ ...p, chord: { ...p.chord, assign: e.target.value as ChordAssign } }))
                  }
                  className="field"
                >
                  <option value="cycle">순서대로 이어서</option>
                  <option value="otherHand">반대 손 같은 손가락</option>
                  <option value="sameHand">같은 손 옆 손가락</option>
                </select>
              </Field>
              <Field label="한손 동타 최대 간격 (ms)">
                <NumberField
                  value={profile.chord.oneHandMaxMs}
                  min={0}
                  max={500}
                  step={10}
                  className="w-20"
                  onChange={(v) =>
                    v != null && edit((p) => ({ ...p, chord: { ...p.chord, oneHandMaxMs: v } }))
                  }
                />
              </Field>
              <Field label="한손 동타 두 번째 손가락">
                <Segmented
                  size="sm"
                  value={profile.chord.oneHandDirection}
                  onChange={(oneHandDirection) =>
                    edit((p) => ({ ...p, chord: { ...p.chord, oneHandDirection } }))
                  }
                  options={[
                    { value: 'out', label: '바깥쪽' },
                    { value: 'in', label: '안쪽' },
                  ]}
                />
              </Field>
            </Section>

            <Section title="판정 (연습 모드)">
              <Field label="완벽 / 근접 / 원거리 (±ms)">
                <div className="flex gap-1">
                  {(['perfectMs', 'nearMs', 'farMs'] as const).map((k) => (
                    <NumberField
                      key={k}
                      value={profile.judge[k]}
                      min={1}
                      max={300}
                      className="w-14"
                      onChange={(v) => v != null && edit((p) => ({ ...p, judge: { ...p.judge, [k]: v } }))}
                    />
                  ))}
                </div>
              </Field>
              <Toggle
                label="손가락 틀림을 미스로 계산"
                checked={profile.judge.wrongFingerIsMiss}
                onChange={(v) => edit((p) => ({ ...p, judge: { ...p.judge, wrongFingerIsMiss: v } }))}
              />
            </Section>
          </div>
        )}
      </section>
    </div>
  );
}
