import { BASE_LABEL } from '@adofai-reading/core';
import { useLevel } from '../stores/level';
import { useActiveProfile, useProfiles } from '../stores/profiles';
import { OpenButton } from './OpenButton';
import { Segmented } from './ui';

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
  const profile = useActiveProfile();
  const update = useProfiles((s) => s.update);
  const st = loaded?.level.settings;
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border-soft bg-canvas/90 px-4 backdrop-blur-md">
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
        <Segmented
          size="sm"
          value={profile.simple.base}
          onChange={(base) =>
            update(profile.id, (p) => ({ ...p, mode: 'simple', simple: { ...p.simple, base } }))
          }
          options={([2, 4] as const).map((b) => ({
            value: b,
            label: BASE_LABEL[b],
            title: '레벨 전체의 기본 손배치. 구간별로는 일시정지 후 레인 옆 카드에서 바꿉니다.',
          }))}
        />
        <OpenButton />
      </div>
    </header>
  );
}
