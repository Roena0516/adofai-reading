import type { FingeringProfile } from '@adofai-reading/core';
import { defaultProfile, normalizeProfile } from '@adofai-reading/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** One fingering setup per browser (older saves may hold several; the active one is used). */
interface ProfilesStore {
  profiles: FingeringProfile[];
  activeId: string;
  update: (id: string, fn: (p: FingeringProfile) => FingeringProfile) => void;
}

const initial = defaultProfile();

export const useProfiles = create<ProfilesStore>()(
  persist(
    (set) => ({
      profiles: [initial],
      activeId: initial.id,
      update: (id, fn) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? normalizeProfile(fn(p)) : p)) })),
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
