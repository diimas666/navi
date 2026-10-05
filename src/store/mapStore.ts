import {create} from 'zustand';

export type RegionDownload = {
  id: string;
  status: 'idle' | 'downloading' | 'downloaded' | 'error';
  progress: number;
  packId: string | null;
  error: string | null;
  detail: string | null;
};

type MapState = {
  regions: Record<string, RegionDownload>;
  online: boolean;
  linkKnown: boolean;
  setOnline: (online: boolean) => void;
  patchRegion: (id: string, patch: Partial<RegionDownload>) => void;
  hydrateRegions: (regions: Record<string, RegionDownload>) => void;
};

const empty = (id: string): RegionDownload => ({
  id,
  status: 'idle',
  progress: 0,
  packId: null,
  error: null,
  detail: null,
});

export const useMapStore = create<MapState>(set => ({
  regions: {},
  online: false,
  linkKnown: false,
  setOnline: online => set({online, linkKnown: true}),
  patchRegion: (id, patch) =>
    set(state => ({
      regions: {
        ...state.regions,
        [id]: {...(state.regions[id] ?? empty(id)), ...patch},
      },
    })),
  hydrateRegions: regions => set({regions}),
}));
