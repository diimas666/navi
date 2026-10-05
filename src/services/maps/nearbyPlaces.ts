import {Platform} from 'react-native';

import {GOOGLE_MAPS_KEY} from '../../constants/googleMapsKey';
import {haversineMeters} from '../../utils/geo';

export type NearbyKind = 'pharmacy' | 'food' | 'cafe' | 'train' | 'bus' | 'gov';

export type NearbyPlace = {
  id: string;
  name: string;
  kind: NearbyKind;
  latitude: number;
  longitude: number;
  rating?: number;
  ratings?: number;
  openNow?: boolean;
};

export type PlaceHours = {
  openNow?: boolean;
  today?: string;
};

const HEADERS: Record<string, string> =
  Platform.OS === 'ios' ? {'X-Ios-Bundle-Identifier': 'com.neiv.app'} : {};

const CITY_GROUPS: Array<{type: string; kind: NearbyKind}> = [
  {type: 'train_station', kind: 'train'},
  {type: 'bus_station', kind: 'bus'},
  {type: 'city_hall', kind: 'gov'},
  {type: 'hospital', kind: 'gov'},
];

const STREET_GROUPS: Array<{type: string; kind: NearbyKind}> = [
  ...CITY_GROUPS,
  {type: 'pharmacy', kind: 'pharmacy'},
  {type: 'restaurant', kind: 'food'},
  {type: 'cafe', kind: 'cafe'},
  {type: 'police', kind: 'gov'},
];

const cache = new Map<string, NearbyPlace[]>();
const inflight = new Map<string, Promise<NearbyPlace[]>>();
const hoursCache = new Map<string, PlaceHours>();

export function nearbyRadius(zoom: number): number {
  if (zoom >= 16.2) {
    return 550;
  }
  if (zoom >= 15) {
    return 900;
  }
  if (zoom >= 14) {
    return 1300;
  }
  if (zoom >= 13) {
    return 2000;
  }
  if (zoom >= 11.2) {
    return 8000;
  }
  if (zoom >= 9.5) {
    return 14000;
  }
  return 0;
}

export function nearbyCell(latitude: number, longitude: number, zoom: number): string {
  const step = zoom >= 16 ? 0.006 : zoom >= 14 ? 0.01 : zoom >= 12 ? 0.03 : 0.06;
  return `${Math.round(latitude / step)}:${Math.round(longitude / step)}:${Math.round(zoom)}`;
}

export async function fetchNearbyPlaces(
  latitude: number,
  longitude: number,
  zoom: number,
  language: 'uk' | 'ru',
): Promise<NearbyPlace[]> {
  const radius = nearbyRadius(zoom);
  if (radius === 0 || GOOGLE_MAPS_KEY.length < 20) {
    return [];
  }
  const key = `${language}|${nearbyCell(latitude, longitude, zoom)}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }
  const work = loadNearby(latitude, longitude, radius, zoom, language)
    .then(places => {
      if (cache.size > 40) {
        cache.clear();
      }
      cache.set(key, places);
      inflight.delete(key);
      return places;
    })
    .catch(error => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, work);
  return work;
}

export async function fetchPlaceHours(placeId: string, language: 'uk' | 'ru'): Promise<PlaceHours | null> {
  const known = hoursCache.get(placeId);
  if (known) {
    return known;
  }
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'opening_hours',
    language,
    key: GOOGLE_MAPS_KEY,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    status?: string;
    result?: {opening_hours?: {open_now?: boolean; weekday_text?: string[]}};
  };
  if (payload.status !== 'OK') {
    return null;
  }
  const hours = payload.result?.opening_hours;
  if (!hours) {
    const empty = {};
    hoursCache.set(placeId, empty);
    return empty;
  }
  const index = (new Date().getDay() + 6) % 7;
  const raw = hours.weekday_text?.[index]?.replace(/^[^:]+:\s*/, '').trim();
  const today = raw && raw.length > 2 ? raw : undefined;
  const next = {openNow: hours.open_now, today};
  hoursCache.set(placeId, next);
  return next;
}

async function loadNearby(
  latitude: number,
  longitude: number,
  radius: number,
  zoom: number,
  language: 'uk' | 'ru',
): Promise<NearbyPlace[]> {
  const groups = zoom < 13 ? CITY_GROUPS : STREET_GROUPS;
  const batches = await Promise.all(
    groups.map(group => oneType(group.type, group.kind, latitude, longitude, radius, language)),
  );
  const seen = new Set<string>();
  const merged: NearbyPlace[] = [];
  batches.flat().forEach(place => {
    if (!keepPlace(place, zoom)) {
      return;
    }
    const stamp = `${place.kind}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}`;
    if (seen.has(place.id) || seen.has(stamp)) {
      return;
    }
    seen.add(place.id);
    seen.add(stamp);
    merged.push(place);
  });
  const gap = zoom >= 16 ? 90 : zoom >= 14 ? 160 : zoom >= 13 ? 240 : 500;
  const rank: Record<NearbyKind, number> = {train: 0, bus: 1, pharmacy: 2, gov: 3, cafe: 4, food: 5};
  const thinned = thin(merged.sort((left, right) => rank[left.kind] - rank[right.kind]), gap);
  return takeByKind(thinned, zoom < 13 ? {train: 8, bus: 6, gov: 6} : {train: 4, bus: 3, pharmacy: 8, gov: 4, cafe: 6, food: 6});
}

async function oneType(
  type: string,
  kind: NearbyKind,
  latitude: number,
  longitude: number,
  radius: number,
  language: 'uk' | 'ru',
): Promise<NearbyPlace[]> {
  const params = new URLSearchParams({
    location: `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    radius: String(radius),
    type,
    language,
    key: GOOGLE_MAPS_KEY,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      place_id?: string;
      name?: string;
      rating?: number;
      user_ratings_total?: number;
      opening_hours?: {open_now?: boolean};
      geometry?: {location?: {lat?: number; lng?: number}};
    }>;
  };
  if ((payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') || !Array.isArray(payload.results)) {
    return [];
  }
  return payload.results.flatMap(item => {
    const spot = item.geometry?.location;
    if (!item.place_id || !item.name || spot?.lat == null || spot.lng == null) {
      return [];
    }
    return [
      {
        id: item.place_id,
        name: item.name,
        kind,
        latitude: spot.lat,
        longitude: spot.lng,
        rating: item.rating,
        ratings: item.user_ratings_total,
        openNow: item.opening_hours?.open_now,
      },
    ];
  });
}

function keepPlace(place: NearbyPlace, zoom: number): boolean {
  const name = place.name.trim();
  if (name.length < 3) {
    return false;
  }
  if (place.kind === 'bus' && !/вокзал|станц|автостан|автовокзал|bus/i.test(name)) {
    return false;
  }
  if (place.kind === 'train' && /зупинка|остановка|stop/i.test(name) && !/вокзал|станц/i.test(name)) {
    return false;
  }
  if ((place.kind === 'food' || place.kind === 'cafe') && zoom >= 13) {
    const known = (place.ratings ?? 0) >= 18 || (place.rating ?? 0) >= 4;
    if (!known) {
      return false;
    }
  }
  return true;
}

function thin(places: NearbyPlace[], gap: number): NearbyPlace[] {
  const kept: NearbyPlace[] = [];
  places.forEach(place => {
    const close = kept.some(
      item => item.kind === place.kind && haversineMeters(item.latitude, item.longitude, place.latitude, place.longitude) < gap,
    );
    if (!close) {
      kept.push(place);
    }
  });
  return kept;
}

function takeByKind(places: NearbyPlace[], limits: Partial<Record<NearbyKind, number>>): NearbyPlace[] {
  const used: Partial<Record<NearbyKind, number>> = {};
  return places.filter(place => {
    const limit = limits[place.kind] ?? 0;
    const count = used[place.kind] ?? 0;
    if (count >= limit) {
      return false;
    }
    used[place.kind] = count + 1;
    return true;
  });
}

export const nearbyColors: Record<NearbyKind, string> = {
  pharmacy: '#1B8A4A',
  food: '#E67E22',
  cafe: '#C0392B',
  train: '#1A73E8',
  bus: '#0D47A1',
  gov: '#5D6D7E',
};

export const nearbyMarks: Record<NearbyKind, string> = {
  pharmacy: '+',
  food: 'Р',
  cafe: 'К',
  train: 'Ж',
  bus: 'В',
  gov: 'Г',
};
