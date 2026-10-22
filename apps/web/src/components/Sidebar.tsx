import { BarChart3, Hand, Layers, SlidersHorizontal } from 'lucide-react';
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

export function Sidebar() {
  const tab = useSettings((s) => s.sidebarTab);
  const set = useSettings((s) => s.set);
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-r border-border-soft bg-canvas-alt">
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
