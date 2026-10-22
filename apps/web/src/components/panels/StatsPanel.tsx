import { divisionLabel, keyLabel, laneLabel } from '@adofai-reading/core';
import { Repeat, RotateCcw } from 'lucide-react';
import { seek, setLoop } from '../../chart/controls';
import { useChart } from '../../chart/model';
import { formatMs, formatTime, pct } from '../../lib/format';
import { laneColor } from '../../render/colors';
import { usePractice } from '../../stores/practice';
import { useSettings } from '../../stores/settings';
import { Button, Section } from '../ui';

export function StatsPanel() {
  const model = useChart();
  const mode = useSettings((s) => s.mode);
  const setSettings = useSettings((s) => s.set);
  const leadIn = useSettings((s) => s.leadIn);
  const stats = usePractice((s) => s.stats);
  const scores = usePractice((s) => s.runScores);
  const restart = usePractice((s) => s.restart);

  if (mode !== 'practice') {
    return (
      <div className="space-y-3 p-4 text-sm text-muted">
        <p>연습 모드에서 지정한 키로 치면 타이밍과 손가락 판정 통계가 여기에 쌓입니다.</p>
        <Button variant="primary" onClick={() => setSettings({ mode: 'practice' })}>
          연습 모드로 바꾸기
        </Button>
      </div>
    );
  }
  if (!stats || !stats.judged) {
    return (
      <div className="p-4 text-sm leading-relaxed text-muted">
        Space로 재생하고 타법 탭에서 지정한 키로 쳐 보세요. 판정 결과가 실시간으로 여기에 모입니다.
      </div>
    );
  }

  const weak = scores
    .filter((s) => s.run.eventCount >= 4 && s.judged >= 4)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);
  const meanLabel =
    Math.abs(stats.meanMs) < 3 ? '정확함' : stats.meanMs > 0 ? '늦게 치는 편' : '빨리 치는 편';

  return (
    <div className="space-y-6 p-4">
      <Section
        title="이번 연습"
        aside={
          <Button size="sm" variant="ghost" onClick={restart}>
            <RotateCcw size={13} /> 초기화
          </Button>
        }
      >
        <div className="flex items-end justify-between">
          <div className="text-3xl font-medium text-ink tabular">{pct(stats.accuracy)}</div>
          <div className="text-right text-xs text-muted tabular">
            판정 {stats.judged}개 · 최대 콤보 {stats.maxCombo}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 text-center text-xs tabular">
          {[
            ['완벽', stats.perfect, 'text-perfect'],
            ['빠름·느림', stats.near, 'text-near'],
            ['빠름·느림', stats.far, 'text-far'],
            ['틀림', stats.wrong, 'text-wrong'],
            ['미스', stats.miss, 'text-miss'],
          ].map(([label, n, color]) => (
            <div key={color as string} className="rounded-md bg-surface-2 py-1.5">
              <div className={`text-base font-medium ${color}`}>{n as number}</div>
              <div className="text-dim">{label as string}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-soft tabular">
          평균 {formatMs(stats.meanMs)} <span className="text-dim">({meanLabel})</span> · 흔들림 ±
          {stats.sdMs.toFixed(1)}ms
        </p>
      </Section>

      <Section title="손가락별">
        <table className="w-full text-sm tabular">
          <thead className="text-xs text-dim">
            <tr>
              <th className="py-1 text-left font-medium">손가락</th>
              <th className="py-1 text-right font-medium">타수</th>
              <th className="py-1 text-right font-medium">평균</th>
              <th className="py-1 text-right font-medium">±</th>
              <th className="py-1 text-right font-medium">틀림</th>
              <th className="py-1 text-right font-medium">미스</th>
            </tr>
          </thead>
          <tbody>
            {stats.lanes.map((l) => {
              const ln = model.lanes[l.lane];
              if (!ln) return null;
              return (
                <tr key={l.lane} className="border-t border-border-soft">
                  <td className="py-1" style={{ color: laneColor(ln) }}>
                    {l.lane + 1} {laneLabel(ln)}{' '}
                    <span className="text-xs text-dim">{keyLabel(model.profile.keys[l.lane] ?? '')}</span>
                  </td>
                  <td className="py-1 text-right">{l.hits}</td>
                  <td className={`py-1 text-right ${Math.abs(l.meanMs) > 15 ? 'text-warn' : ''}`}>
                    {l.hits ? formatMs(l.meanMs) : '–'}
                  </td>
                  <td className="py-1 text-right text-muted">{l.hits ? l.sdMs.toFixed(0) : '–'}</td>
                  <td className="py-1 text-right text-wrong">{l.wrong || ''}</td>
                  <td className="py-1 text-right text-miss">{l.miss || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-dim">
          평균이 +면 늦게, −면 빨리 친 것입니다. 틀림은 그 손가락이 쳐야 할 노트를 다른 키로 친 횟수입니다.
        </p>
      </Section>

      {weak.length > 0 && (
        <Section title="약한 연타 구간">
          <ul className="space-y-1.5">
            {weak.map((s) => (
              <li
                key={s.run.index}
                className="flex items-center gap-2 rounded-md bg-canvas-alt px-2 py-1.5 text-sm tabular"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => seek(s.run.startTime - leadIn)}
                >
                  <div className="text-ink-2">
                    {formatTime(s.run.startTime, 1)} · {Math.round(s.run.effBpm)} BPM ·{' '}
                    {divisionLabel(s.run.division, s.run.divisionRaw)}
                  </div>
                  <div className="text-xs text-dim">
                    {s.run.eventCount}타 · 틀림 {s.wrong} · 미스 {s.miss}
                  </div>
                </button>
                <span className={s.accuracy < 0.8 ? 'text-wrong' : 'text-far'}>{pct(s.accuracy, 1)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  title="이 구간 반복"
                  aria-label="이 구간 반복"
                  onClick={() => {
                    setLoop(s.run.startTime - leadIn, s.run.endTime + 0.4);
                    seek(s.run.startTime - leadIn);
                  }}
                >
                  <Repeat size={13} />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
