import AsyncStorage from '@react-native-async-storage/async-storage';

import type {TripRecord} from '../../models/domain';

const KEY = 'neiv.trips.v1';

export async function loadTrips(): Promise<TripRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as TripRecord[]) : [];
}

export async function saveTrips(trips: TripRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(trips));
}
