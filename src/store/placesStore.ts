import {create} from 'zustand';

import type {ExtraPlace, SavedPlace, SavedPlaceKind} from '../constants/places';
import {savePlaces, type PlacesSnapshot} from '../services/places/PlacesRepository';

type PlacesState = {
  places: Partial<Record<SavedPlaceKind, SavedPlace>>;
  extra: ExtraPlace[];
  hydrate: (snapshot: PlacesSnapshot) => void;
  setPlace: (place: SavedPlace) => void;
  removePlace: (kind: SavedPlaceKind) => void;
  setExtra: (place: ExtraPlace) => void;
  removeExtra: (id: string) => void;
};

export const usePlacesStore = create<PlacesState>((set, get) => ({
  places: {},
  extra: [],
  hydrate: snapshot => set({places: snapshot.places, extra: snapshot.extra}),
  setPlace: place => {
    const places = {...get().places, [place.kind]: place};
    set({places});
    savePlaces(places, get().extra).catch(() => undefined);
  },
  removePlace: kind => {
    const places = {...get().places};
    delete places[kind];
    set({places});
    savePlaces(places, get().extra).catch(() => undefined);
  },
  setExtra: place => {
    const current = get().extra;
    const extra = current.some(item => item.id === place.id)
      ? current.map(item => (item.id === place.id ? place : item))
      : [...current, place];
    set({extra});
    savePlaces(get().places, extra).catch(() => undefined);
  },
  removeExtra: id => {
    const extra = get().extra.filter(item => item.id !== id);
    set({extra});
    savePlaces(get().places, extra).catch(() => undefined);
  },
}));
