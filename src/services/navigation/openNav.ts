import AsyncStorage from '@react-native-async-storage/async-storage';

import type {Place} from '../../models/domain';

const KEY = 'neiv.openNav.v1';

export type OpenNav = {
  destination: Place;
  stops: Place[];
};

export async function saveOpenNav(nav: OpenNav): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(nav));
}

export async function loadOpenNav(): Promise<OpenNav | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Partial<OpenNav>;
    const destination = asPlace(record.destination);
    if (!destination) {
      return null;
    }
    const stops = Array.isArray(record.stops) ? record.stops.flatMap(item => {
      const place = asPlace(item);
      return place ? [place] : [];
    }) : [];
    return {destination, stops};
  } catch {
    return null;
  }
}

export async function clearOpenNav(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

function asPlace(value: unknown): Place | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<Place>;
  if (
    typeof record.name !== 'string' ||
    typeof record.latitude !== 'number' ||
    typeof record.longitude !== 'number' ||
    !Number.isFinite(record.latitude) ||
    !Number.isFinite(record.longitude)
  ) {
    return null;
  }
  return {
    id: typeof record.id === 'string' ? record.id : `${record.longitude}:${record.latitude}`,
    name: record.name,
    latitude: record.latitude,
    longitude: record.longitude,
    kind: typeof record.kind === 'string' ? record.kind : 'place',
    detail: typeof record.detail === 'string' ? record.detail : undefined,
  };
}
