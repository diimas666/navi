import {create} from 'zustand';

import type {Place} from '../models/domain';
import {
  historyFromPlace,
  mergeHistory,
  type HistoryPlace,
} from '../services/search/searchHistory';
import {saveSearchHistory} from '../services/search/SearchHistoryRepository';

type SearchHistoryState = {
  items: HistoryPlace[];
  hydrate: (items: HistoryPlace[]) => void;
  remember: (place: Place) => void;
};

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  items: [],
  hydrate: items => set({items}),
  remember: place => {
    const next = historyFromPlace(place);
    if (!next) {
      return;
    }
    const items = mergeHistory(get().items, next);
    set({items});
    saveSearchHistory(items).catch(() => undefined);
  },
}));
