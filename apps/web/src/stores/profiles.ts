import type { FingeringProfile } from '@adofai-reading/core';
import {
  PROFILE_PRESETS,
  defaultProfile,
  newProfileId,
  normalizeProfile,
  profileFromPreset,
} from '@adofai-reading/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfilesStore {
  profiles: FingeringProfile[];
  activeId: string;
  setActive: (id: string) => void;
  update: (id: string, fn: (p: FingeringProfile) => FingeringProfile) => void;
  createFromPreset: (key: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  importProfiles: (data: unknown) => number;
}

const initial = defaultProfile();

export const useProfiles = create<ProfilesStore>()(
  persist(
    (set, get) => ({
      profiles: [initial],
      activeId: initial.id,
      setActive: (id) => set({ activeId: id }),
      update: (id, fn) =>
        set((s) => ({
          profiles: s.profiles.map((p) => {
            if (p.id !== id) return p;
            return normalizeProfile(fn(p));
          }),
        })),
      createFromPreset: (key) => {
        const preset = PROFILE_PRESETS.find((p) => p.key === key) ?? PROFILE_PRESETS[0]!;
        const p = profileFromPreset(preset);
        set((s) => ({ profiles: [...s.profiles, p], activeId: p.id }));
      },
      duplicate: (id) => {
        const src = get().profiles.find((p) => p.id === id);
        if (!src) return;
        const copy = normalizeProfile({
          ...structuredClone(src),
          id: newProfileId(),
          name: `${src.name} 복사본`,
        });
        set((s) => ({ profiles: [...s.profiles, copy], activeId: copy.id }));
      },
      remove: (id) =>
        set((s) => {
          const rest = s.profiles.filter((p) => p.id !== id);
          const profiles = rest.length ? rest : [defaultProfile()];
          return {
            profiles,
            activeId: profiles.some((p) => p.id === s.activeId) ? s.activeId : profiles[0]!.id,
          };
        }),
      importProfiles: (data) => {
        const list = Array.isArray(data)
          ? data
          : data && typeof data === 'object' && Array.isArray((data as { profiles?: unknown }).profiles)
            ? (data as { profiles: unknown[] }).profiles
            : [data];
        const imported = list.map((x) => normalizeProfile({ ...(x as object), id: newProfileId() }));
        if (!imported.length) return 0;
        set((s) => ({ profiles: [...s.profiles, ...imported], activeId: imported[0]!.id }));
        return imported.length;
      },
    }),
    {
      name: 'adofai-reading:profiles',
      version: 1,
      merge: (persisted, current) => {
        const p = persisted as Partial<ProfilesStore> | undefined;
        const profiles = (p?.profiles ?? []).map((x) => normalizeProfile(x));
        if (!profiles.length) return current;
        const activeId = profiles.some((x) => x.id === p?.activeId) ? p!.activeId! : profiles[0]!.id;
        return { ...current, profiles, activeId };
      },
    },
  ),
);

export function useActiveProfile(): FingeringProfile {
  return useProfiles((s) => s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0]!);
}
