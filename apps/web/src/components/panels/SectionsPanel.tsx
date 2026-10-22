import type { RangeOverride } from '@adofai-reading/core';
import { describeOrder, formatOrder, lowerBound, parseOrder, upperBound } from '@adofai-reading/core';
import { Download, LocateFixed, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { seek, setLoop } from '../../chart/controls';
import { exportLevelFingering, importLevelFingering } from '../../chart/levelFile';
import { useChart } from '../../chart/model';
import { formatTime } from '../../lib/format';
import { newRangeId, useLevelOverrides, useOverrides } from '../../stores/overrides';
import type { LevelOverrides } from '../../stores/overrides';
import { usePlayer } from '../../stores/player';
import { useSettings } from '../../stores/settings';
import { Button, NumberField, Section, TextField, Toggle, cx } from '../ui';

export function SectionsPanel() {
  const model = useChart();
  const { timing, analysis, fingering, lanes, loaded } = model;
  const hash = loaded.hash;
  const ov = useLevelOverrides(hash);
  const patch = useOverrides((s) => s.patch);
  const time = usePlayer((s) => s.time);
  const loopA = usePlayer((s) => s.loopA);
  const loopB = usePlayer((s) => s.loopB);
  const leadIn = useSettings((s) => s.leadIn);
  const [message, setMessage] = useState<string | null>(null);
  const update = (fn: (o: LevelOverrides) => LevelOverrides) => patch(hash, fn);

  const noteIdx = Math.max(0, upperBound(timing.noteTimes, time) - 1);
  const currentFloor = timing.notes[noteIdx]?.floor ?? 1;
  const floorTime = (f: number) => timing.tiles[Math.max(0, Math.min(timing.tiles.length - 1, f))]!.time;
  const floorAt = (t: number) =>
    timing.notes[Math.max(0, Math.min(timing.notes.length - 1, lowerBound(timing.noteTimes, t - 1e-6)))]!
      .floor;

  const editSections = () =>
    update((o) => ({
      ...o,
      sections: model.sections.map((s) => ({ floor: s.startFloor, bpm: +s.bpm.toFixed(3) })),
    }));
  const sectionEdits = ov.sections;

  const addRange = (from: number, to: number) => {
    const run = analysis.runs[analysis.events[analysis.noteEvent[noteIdx]!]!.run]!;
    const seq = fingering.runSeq[run.index] ?? [0];
    const range: RangeOverride = {
      id: newRangeId(),
      fromFloor: from,
      toFloor: to,
      sequence: formatOrder(seq),
      enabled: true,
    };
    update((o) => ({ ...o, ranges: [...o.ranges, range] }));
  };
  const setRange = (id: string, p: Partial<RangeOverride>) =>
    update((o) => ({ ...o, ranges: o.ranges.map((r) => (r.id === id ? { ...r, ...p } : r)) }));

  const exportLevel = () => exportLevelFingering(model);
  const importLevel = async () => {
    try {
      setMessage(await importLevelFingering(model));
    } catch (e) {
      setMessage(`가져오지 못했어요: ${(e as Error).message}`);
    }
  };

  const noteOverrideCount = Object.keys(ov.notes).length;

  return (
    <div className="space-y-6 p-4">
      <Section
        title="기준 BPM 구간"
        aside={
          sectionEdits ? (
            <Button size="sm" variant="ghost" onClick={() => update((o) => ({ ...o, sections: null }))}>
              자동 감지로 되돌리기
            </Button>
          ) : (
            <Button size="sm" onClick={editSections}>
              직접 편집
            </Button>
          )
        }
      >
        <p className="text-xs leading-relaxed text-dim">
          커스텀 레벨은 타일 BPM으로 리듬을 표현해서 실제 곡 BPM과 다를 때가 많습니다. 여기 BPM을 기준으로
          박자와 16비트·32비트를 계산합니다.
          {!sectionEdits && ' 지금은 자동 감지 결과입니다.'}
        </p>
        <div className="overflow-hidden rounded-xl border border-border-soft">
          <table className="w-full text-sm tabular">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">타일</th>
                <th className="px-2 py-1.5 text-left font-medium">시간</th>
                <th className="px-2 py-1.5 text-left font-medium">BPM</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(sectionEdits ?? model.sections.map((s) => ({ floor: s.startFloor, bpm: s.bpm }))).map(
                (s, i) => (
                  <tr key={i} className="border-t border-border-soft">
                    <td className="px-2 py-1">
                      {sectionEdits ? (
                        <NumberField
                          value={s.floor}
                          min={0}
                          className="w-20"
                          onChange={(v) =>
                            v != null &&
                            update((o) => ({
                              ...o,
                              sections: o.sections!.map((x, k) =>
                                k === i ? { ...x, floor: Math.round(v) } : x,
                              ),
                            }))
                          }
                        />
                      ) : (
                        `#${s.floor}`
                      )}
                    </td>
                    <td className="px-2 py-1 text-muted">{formatTime(floorTime(s.floor), 1)}</td>
                    <td className="px-2 py-1">
                      {sectionEdits ? (
                        <NumberField
                          value={s.bpm}
                          min={1}
                          step={0.01}
                          className="w-24"
                          onChange={(v) =>
                            v != null &&
                            update((o) => ({
                              ...o,
                              sections: o.sections!.map((x, k) => (k === i ? { ...x, bpm: v } : x)),
                            }))
                          }
                        />
                      ) : (
                        <span className="text-warn">{+s.bpm.toFixed(3)}</span>
                      )}
                    </td>
                    <td className="px-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="이 위치로 이동"
                        onClick={() => seek(floorTime(s.floor) - leadIn)}
                      >
                        <LocateFixed size={13} />
                      </Button>
                      {sectionEdits && sectionEdits.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="구간 삭제"
                          onClick={() =>
                            update((o) => ({ ...o, sections: o.sections!.filter((_, k) => k !== i) }))
                          }
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {sectionEdits && (
          <Button
            size="sm"
            onClick={() =>
              update((o) => {
                const cur = model.sections.filter((s) => s.startFloor <= currentFloor).at(-1);
                return {
                  ...o,
                  sections: [
                    ...(o.sections ?? []),
                    { floor: currentFloor, bpm: +(cur?.bpm ?? 120).toFixed(3) },
                  ],
                };
              })
            }
          >
            <Plus size={14} /> 현재 타일(#{currentFloor})에 구간 추가
          </Button>
        )}
      </Section>

      <Section title="구간 타법 직접 지정">
        <p className="text-xs leading-relaxed text-dim">
          특정 타일 범위의 노트에 키 순서를 그대로 적용합니다. 순환 순서(3421)나 노트별 표기(3222322232232232)
          모두 됩니다. 짧으면 반복합니다.
        </p>
        <div className="space-y-2">
          {ov.ranges.map((r) => {
            const parsed = parseOrder(r.sequence, lanes.length);
            return (
              <div
                key={r.id}
                className={cx(
                  'space-y-2 rounded-xl border border-border-soft bg-surface p-3',
                  !r.enabled && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-dim">타일</span>
                  <NumberField
                    value={r.fromFloor}
                    min={0}
                    className="w-20"
                    onChange={(v) => v != null && setRange(r.id, { fromFloor: Math.round(v) })}
                  />
                  <span className="text-dim">~</span>
                  <NumberField
                    value={r.toFloor}
                    min={0}
                    className="w-20"
                    onChange={(v) => v != null && setRange(r.id, { toFloor: Math.round(v) })}
                  />
                  <div className="ml-auto flex">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="이동"
                      onClick={() => seek(floorTime(r.fromFloor) - leadIn)}
                    >
                      <LocateFixed size={13} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="지정 삭제"
                      onClick={() => update((o) => ({ ...o, ranges: o.ranges.filter((x) => x.id !== r.id) }))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <TextField
                  value={r.sequence}
                  live
                  invalid={!!parsed.error}
                  onCommit={(sequence) => setRange(r.id, { sequence: sequence.trim() })}
                  className="w-full font-mono tracking-widest"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className={cx('min-w-0 truncate text-xs', parsed.error ? 'text-wrong' : 'text-muted')}>
                    {parsed.error ??
                      describeOrder(parsed.seq.slice(0, 8), lanes) + (parsed.seq.length > 8 ? ' …' : '')}
                  </p>
                  <Toggle label="" checked={r.enabled} onChange={(enabled) => setRange(r.id, { enabled })} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => addRange(currentFloor, currentFloor + 15)}>
            <Plus size={14} /> 현재 위치부터
          </Button>
          <Button
            size="sm"
            disabled={loopA == null || loopB == null}
            onClick={() =>
              loopA != null &&
              loopB != null &&
              addRange(floorAt(Math.min(loopA, loopB)), floorAt(Math.max(loopA, loopB)))
            }
          >
            <Plus size={14} /> A-B 구간으로
          </Button>
          {loopA != null && loopB != null && (
            <Button size="sm" variant="ghost" onClick={() => setLoop(loopA, loopB)}>
              반복 켜기
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="노트별 수정"
        aside={
          noteOverrideCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => update((o) => ({ ...o, notes: {} }))}>
              모두 지우기
            </Button>
          )
        }
      >
        <p className="text-xs leading-relaxed text-dim">
          일시정지한 상태에서 레인의 노트를 끌어서 다른 레인으로 옮기거나, 클릭해서 다음 손가락으로 바꿉니다.
          Shift+클릭은 이전 손가락, 우클릭은 원래대로입니다. 지금 {noteOverrideCount}개 노트를 직접 바꿨고,
          바꾸는 즉시 이 브라우저에 저장됩니다.
        </p>
      </Section>

      <Section title="이 레벨의 타법 저장">
        <div className="flex gap-2">
          <Button size="sm" onClick={exportLevel}>
            <Download size={14} /> 내보내기
          </Button>
          <Button size="sm" onClick={importLevel}>
            <Upload size={14} /> 가져오기
          </Button>
        </div>
        <p className="text-xs text-dim">
          현재 프로필과 이 레벨의 구간·노트 수정을 JSON 하나로 저장합니다. 레벨 파일은 건드리지 않습니다.
        </p>
        {message && <p className="text-xs text-accent-soft">{message}</p>}
      </Section>
    </div>
  );
}
