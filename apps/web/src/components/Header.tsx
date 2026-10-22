import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLevel } from '../stores/level';
import { useProfiles } from '../stores/profiles';
import { useSettings } from '../stores/settings';
import { OpenButton } from './OpenButton';
import { Button } from './ui';

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
      <circle cx="11" cy="16" r="7" fill="#38bdf8" />
      <circle cx="21" cy="16" r="7" fill="#f472b6" fillOpacity="0.85" />
    </svg>
  );
}

export function Header() {
  const loaded = useLevel((s) => s.loaded);
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const setActive = useProfiles((s) => s.setActive);
  const st = loaded?.level.settings;
  const sidebarOpen = useSettings((s) => s.sidebarOpen);
  const setSettings = useSettings((s) => s.set);
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border-soft bg-canvas/90 px-4 backdrop-blur-md">
      {loaded && (
        <Button
          size="sm"
          variant="ghost"
          className="-ml-1 w-8 px-0"
          aria-label={sidebarOpen ? '사이드바 숨기기' : '사이드바 보이기'}
          title={sidebarOpen ? '사이드바 숨기기' : '사이드바 보이기'}
          onClick={() => setSettings({ sidebarOpen: !sidebarOpen })}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-[17px] font-medium text-ink">ADOFAI 타법 리더</span>
      </div>
      {st && (
        <div className="min-w-0 truncate text-sm text-muted">
          <span className="font-medium text-ink">{st.song || '제목 없음'}</span>
          {st.artist && <> · {st.artist}</>}
          {st.author && <span className="text-dim"> · 채보 {st.author}</span>}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          타법
          <select value={activeId} onChange={(e) => setActive(e.target.value)} className="field max-w-48">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <OpenButton />
      </div>
    </header>
  );
}
