import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SAVED_PLACE_KINDS,
  type ExtraPlace,
  type SavedPlace,
  type SavedPlaceKind,
} from '../../constants/places';

const KEY = 'neiv.places.v1';
const EXTRA_LIMIT = 12;

export type PlacesSnapshot = {
  places: Partial<Record<SavedPlaceKind, SavedPlace>>;
  extra: ExtraPlace[];
};

export async function loadPlaces(): Promise<PlacesSnapshot> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return {places: {}, extra: []};
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {places: {}, extra: []};
  }
  const record = parsed as Record<string, unknown>;
  const places: Partial<Record<SavedPlaceKind, SavedPlace>> = {};
  SAVED_PLACE_KINDS.forEach(kind => {
    const value = record[kind.id];
    if (!value || typeof value !== 'object') {
      return;
    }
    const saved = value as Partial<SavedPlace>;
    if (
      saved.kind === kind.id &&
      typeof saved.name === 'string' &&
      typeof saved.latitude === 'number' &&
      typeof saved.longitude === 'number'
    ) {
      places[kind.id] = {
        kind: kind.id,
        name: saved.name,
        latitude: saved.latitude,
        longitude: saved.longitude,
      };
    }
  });
  return {places, extra: readExtra(record.extra)};
}

export async function savePlaces(
  places: Partial<Record<SavedPlaceKind, SavedPlace>>,
  extra: ExtraPlace[],
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({...places, extra}));
}

function readExtra(value: unknown): ExtraPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const extra: ExtraPlace[] = [];
  value.forEach(item => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const saved = item as Partial<ExtraPlace>;
    if (
      typeof saved.id !== 'string' ||
      typeof saved.title !== 'string' ||
      !saved.title.trim() ||
      typeof saved.name !== 'string' ||
      typeof saved.latitude !== 'number' ||
      typeof saved.longitude !== 'number'
    ) {
      return;
    }
    extra.push({
      id: saved.id,
      title: saved.title.trim().slice(0, 24),
      name: saved.name,
      latitude: saved.latitude,
      longitude: saved.longitude,
    });
  });
  return extra.slice(0, EXTRA_LIMIT);
}
