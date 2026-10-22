import { useChart } from '../chart/model';
import { laneOverlayWidth } from '../render/laneRenderer';
import { usePlayer } from '../stores/player';
import { useSettings } from '../stores/settings';
import { Hud, LaneView, PracticeHud } from './LaneView';
import { NoteEditsCard } from './NoteEditsCard';
import { TrackView } from './TrackView';

/**
 * The main area. With the game view on, it fills the whole stage and the lanes sit on its left
 * as a translucent panel; otherwise the lanes take the full width.
 */
export function Stage() {
  const model = useChart();
  const settings = useSettings();
  const playing = usePlayer((s) => s.playing);
  const overlay = settings.showTrack;
  const width = overlay ? laneOverlayWidth(model.lanes, settings) : 0;
  const left = overlay ? width + 12 : 12;
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      {overlay && <TrackView leftInset={width} />}
      <LaneView overlay={overlay} width={width} />
      <div className="pointer-events-none absolute top-3 z-20 w-[232px] space-y-2" style={{ left }}>
        <Hud model={model} settings={settings} />
        {settings.mode === 'practice' && <PracticeHud />}
        {!playing && <NoteEditsCard model={model} />}
      </div>
      {!playing && (
        <div
          className="pointer-events-none absolute bottom-2 z-20 rounded-full bg-surface/90 px-3 py-0.5 text-[11px] whitespace-nowrap text-muted"
          style={{ left: overlay ? width / 2 : '50%', transform: 'translateX(-50%)' }}
        >
          일시정지 · 노트 드래그: 레인 이동 · 클릭: 다음 손가락 · 우클릭: 되돌리기
        </div>
      )}
    </div>
  );
}
