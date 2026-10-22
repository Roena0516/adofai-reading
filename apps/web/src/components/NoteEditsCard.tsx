import type { KeyBase } from '@adofai-reading/core';
import { BASE_LABEL, upperBound } from '@adofai-reading/core';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportLevelFingering, importLevelFingering } from '../chart/levelFile';
import type { ChartModel } from '../chart/model';
import { setBaseFrom, useLevelOverrides, useOverrides } from '../stores/overrides';
import { usePlayer } from '../stores/player';
import { Button, ConfirmButton, Segmented } from './ui';

/**
 * Shown next to the lanes while paused: how many notes were moved by hand (saved in this browser
 * as you edit), buttons to export / import them as JSON or undo them all, and the 2키/4키 base to
 * use from the stream at the playhead on.
 */
export function NoteEditsCard({ model }: { model: ChartModel }) {
  const hash = model.loaded.hash;
  const ov = useLevelOverrides(hash);
  const patch = useOverrides((s) => s.patch);
  const [message, setMessage] = useState<string | null>(null);
  const count = Object.keys(ov.notes).length;
  const time = usePlayer((s) => s.time);

  // the stream at the playhead: its first tile is where a base switch starts
  const { timing, analysis, fingering, profile } = model;
  const next = Math.min(timing.notes.length - 1, upperBound(timing.noteTimes, time - 0.02));
  const run = analysis.runs[analysis.events[analysis.noteEvent[next]!]!.run]!;
  const fromFloor = timing.notes[analysis.events[run.firstEvent]!.firstNote]!.floor;
  const baseHere = (fingering.runBase[run.index] || profile.simple.base) as KeyBase;
  const switchHere = (ov.bases ?? []).some((b) => b.floor === fromFloor);
  const setBase = (base: KeyBase) =>
    patch(hash, (o) => setBaseFrom({ ...o, bases: o.bases ?? [] }, fromFloor, base, profile.simple.base));

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const onImport = async () => {
    try {
      setMessage(await importLevelFingering(model));
    } catch (e) {
      setMessage(`가져오지 못했어요: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pointer-events-auto space-y-1.5 rounded-xl border border-border-soft bg-canvas/85 px-2.5 py-2 text-[11px] backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted">
          직접 수정한 노트 <b className="text-ink tabular">{count}</b>개
        </span>
        <span className="text-dim">{count > 0 ? '자동 저장됨' : '드래그해서 수정'}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => exportLevelFingering(model)} title="이 레벨의 타법을 JSON으로 저장">
          <Download size={13} /> 내보내기
        </Button>
        <Button size="sm" onClick={onImport} title="저장해 둔 JSON에서 불러오기">
          <Upload size={13} /> 가져오기
        </Button>
        {count > 0 && (
          <ConfirmButton
            label="직접 수정한 노트 모두 되돌리기"
            armedLabel="정말 되돌리기"
            onConfirm={() => {
              patch(hash, (o) => ({ ...o, notes: {} }));
              setMessage('직접 수정한 노트를 모두 되돌렸어요.');
            }}
          >
            <RotateCcw size={13} />
          </ConfirmButton>
        )}
      </div>
      {profile.mode === 'simple' && (
        <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-1.5">
          <span className="whitespace-nowrap text-muted">
            <b className="text-ink tabular">#{fromFloor}</b>부터 기반
            {switchHere && <span className="text-accent-soft"> · 전환</span>}
          </span>
          <Segmented
            size="sm"
            value={baseHere}
            onChange={setBase}
            options={([2, 4] as const).map((b) => ({
              value: b,
              label: `${b}키`,
              title: `#${fromFloor} 연타부터 ${BASE_LABEL[b]}으로 칩니다`,
            }))}
          />
        </div>
      )}
      {message && <p className="m-0 leading-snug text-accent-soft">{message}</p>}
    </div>
  );
}
