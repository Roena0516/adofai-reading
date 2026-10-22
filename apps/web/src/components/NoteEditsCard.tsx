import { Download, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportLevelFingering, importLevelFingering } from '../chart/levelFile';
import type { ChartModel } from '../chart/model';
import { useLevelOverrides, useOverrides } from '../stores/overrides';
import { Button, ConfirmButton } from './ui';

/**
 * Shown next to the lanes while paused: how many notes were moved by hand (saved in this browser
 * as you edit), and buttons to export / import them as JSON or undo them all.
 */
export function NoteEditsCard({ model }: { model: ChartModel }) {
  const hash = model.loaded.hash;
  const ov = useLevelOverrides(hash);
  const patch = useOverrides((s) => s.patch);
  const [message, setMessage] = useState<string | null>(null);
  const count = Object.keys(ov.notes).length;

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
      {message && <p className="m-0 leading-snug text-accent-soft">{message}</p>}
    </div>
  );
}
