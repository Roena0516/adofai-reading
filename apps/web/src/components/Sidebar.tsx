import { BarChart3, ChevronLeft, ChevronRight, Hand, Layers, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '../stores/settings';
import type { Settings } from '../stores/settings';
import { ProfilePanel } from './panels/ProfilePanel';
import { SectionsPanel } from './panels/SectionsPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { cx } from './ui';

const TABS: Array<{ key: Settings['sidebarTab']; label: string; icon: typeof Hand }> = [
  { key: 'profile', label: '타법', icon: Hand },
  { key: 'sections', label: '구간', icon: Layers },
  { key: 'stats', label: '통계', icon: BarChart3 },
  { key: 'settings', label: '설정', icon: SlidersHorizontal },
];

/** Sidebar width in px; the handle sits on its right edge. */
export const SIDEBAR_WIDTH = 360;

/** A tab on the sidebar's right edge (vertically centred) that hides it, or shows it again from the screen's left edge. */
export function SidebarHandle() {
  const open = useSettings((s) => s.sidebarOpen);
  const set = useSettings((s) => s.set);
  const label = open ? '사이드바 숨기기' : '사이드바 보이기';
  return (
    <button
      type="button"
      onClick={() => set({ sidebarOpen: !open })}
      aria-label={label}
      title={label}
      className="absolute top-1/2 z-30 flex h-14 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-lg border border-l-0 border-border-2 bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
      style={{ left: open ? SIDEBAR_WIDTH : 0 }}
    >
      {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

export function Sidebar() {
  const tab = useSettings((s) => s.sidebarTab);
  const set = useSettings((s) => s.set);
  return (
    <aside
      className="flex shrink-0 flex-col border-r border-border-soft bg-canvas-alt"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <nav className="flex shrink-0 border-b border-border-soft">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => set({ sidebarTab: t.key })}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors',
              tab === t.key ? 'border-accent text-accent-soft' : 'border-transparent text-dim hover:text-ink',
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {tab === 'profile' && <ProfilePanel />}
        {tab === 'sections' && <SectionsPanel />}
        {tab === 'stats' && <StatsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
}
