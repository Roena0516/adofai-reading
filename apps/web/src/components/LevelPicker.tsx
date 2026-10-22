import { useEffect } from 'react';
import { chooseLevel } from '../chart/loader';
import { formatTime } from '../lib/format';
import { useLevel } from '../stores/level';
import { Button } from './ui';

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.adofai$/i, '');

/** After an upload with several .adofai files (difficulties of one song, say), pick the one to open. */
export function LevelPicker() {
  const choice = useLevel((s) => s.choice);
  const close = () => useLevel.getState().set({ choice: null });

  useEffect(() => {
    if (!choice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [choice]);

  if (!choice) return null;
  const { options } = choice;
  const songs = new Set(options.filter((o) => !o.error).map((o) => o.song));
  const shared = songs.size === 1 ? options.find((o) => !o.error) : undefined;
  // most levels leave difficulty at its default, so only show it when it tells the files apart
  const showDifficulty = new Set(options.map((o) => o.difficulty)).size > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-picker-title"
        className="card flex max-h-[80vh] w-full max-w-md flex-col gap-4 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 id="level-picker-title" className="m-0 text-[17px] font-medium">
            어떤 레벨을 열까요?
          </h2>
          <p className="m-0 text-sm text-muted">
            {shared ? `${shared.artist ? `${shared.artist} - ` : ''}${shared.song} · ` : ''}
            레벨 파일이 {options.length}개 있습니다.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 overflow-y-auto p-0.5 scroll-thin">
          {options.map((o, i) => (
            <li key={o.path}>
              <button
                type="button"
                autoFocus={i === 0}
                disabled={!!o.error}
                onClick={() => void chooseLevel(o.path)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-left shadow-[0_0_0_1px_var(--color-border-2)] transition-colors hover:bg-surface-3 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="truncate font-medium text-ink">{nameOf(o.path)}</span>
                  {showDifficulty && o.difficulty !== null && (
                    <span className="ml-auto shrink-0 text-xs text-accent-soft tabular">
                      난이도 {o.difficulty}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted tabular">
                  {o.error
                    ? `열 수 없음 · ${o.error}`
                    : [
                        !shared && o.song,
                        `노트 ${o.notes.toLocaleString()}개`,
                        `${Math.round(o.bpm)} BPM`,
                        formatTime(o.length, 0),
                        o.author && `채보 ${o.author}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
