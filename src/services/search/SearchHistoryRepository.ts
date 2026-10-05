import AsyncStorage from '@react-native-async-storage/async-storage';

import {parseSearchHistory, SEARCH_HISTORY_LIMIT, type HistoryPlace} from './searchHistory';

const KEY = 'neiv.searchHistory.v1';

export async function loadSearchHistory(): Promise<HistoryPlace[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return parseSearchHistory(raw);
}

export async function saveSearchHistory(items: HistoryPlace[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(0, SEARCH_HISTORY_LIMIT)));
}
