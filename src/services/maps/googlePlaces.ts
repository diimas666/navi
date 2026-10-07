import {Platform} from 'react-native';

import {GOOGLE_MAPS_KEY} from '../../constants/googleMapsKey';
import type {Place} from '../../models/domain';
import {wantedHouse} from './addressQuery';

type Bias = {latitude: number; longitude: number};

type Prediction = {
  place_id?: string;
  description?: string;
  distance_meters?: number;
  types?: string[];
  structured_formatting?: {main_text?: string; secondary_text?: string};
};

const BASE = 'https://maps.googleapis.com/maps/api/place';
const HEADERS: Record<string, string> =
  Platform.OS === 'ios' ? {'X-Ios-Bundle-Identifier': 'com.neiv.app'} : {};
const cache = new Map<string, Place[]>();
const resolved = new Map<string, {latitude: number; longitude: number}>();

let session = newSession();

function newSession(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function googleSearchReady(): boolean {
  return GOOGLE_MAPS_KEY.length > 20;
}

export function hasCoordinates(place: Place): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

/**
 * Fast type-ahead like Google Maps. No coordinates yet: the list shows names at once,
 * and the point is fetched only for the row the driver taps.
 */
export async function googleSuggest(query: string, language: 'uk' | 'ru', bias: Bias | null): Promise<Place[]> {
  const text = query.trim();
  const key = `${language}|${bias ? `${bias.latitude.toFixed(2)},${bias.longitude.toFixed(2)}` : ''}|${text.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const params = new URLSearchParams({
    input: text,
    language,
    components: 'country:ua',
    sessiontoken: session,
    key: GOOGLE_MAPS_KEY,
  });
  if (wantedHouse(text)) {
    params.set('types', 'address');
  } else {
    params.set('types', 'geocode');
  }
  if (bias) {
    const spot = `${bias.latitude.toFixed(5)},${bias.longitude.toFixed(5)}`;
    params.set('location', spot);
    params.set('radius', '25000');
    params.set('origin', spot);
    params.set('strictbounds', 'true');
  }
  const response = await fetch(`${BASE}/autocomplete/json?${params.toString()}`, {headers: HEADERS});
  if (!response.ok) {
    throw new Error(`Google ${response.status}`);
  }
  const payload = (await response.json()) as {status?: string; predictions?: Prediction[]};
  if (payload.status === 'ZERO_RESULTS') {
    return [];
  }
  if (payload.status !== 'OK' || !Array.isArray(payload.predictions)) {
    throw new Error(`Google ${payload.status ?? 'bad'}`);
  }
  const places = payload.predictions.flatMap<Place>(item => {
    if (!item.place_id) {
      return [];
    }
    const title = item.structured_formatting?.main_text || item.description?.split(',')[0] || '';
    if (!title) {
      return [];
    }
    const types = item.types ?? [];
    const known = resolved.get(item.place_id);
    return [
      {
        id: `g-${item.place_id}`,
        placeId: item.place_id,
        name: title,
        detail: item.structured_formatting?.secondary_text,
        latitude: known?.latitude ?? Number.NaN,
        longitude: known?.longitude ?? Number.NaN,
        distanceM: item.distance_meters,
        kind: kindOf(types),
      },
    ];
  });
  if (cache.size > 80) {
    cache.clear();
  }
  cache.set(key, places);
  return places;
}

/** Coordinates for the chosen row. One quick request, same billing session as the typing. */
export async function googleResolve(placeId: string, language: 'uk' | 'ru'): Promise<{latitude: number; longitude: number}> {
  const known = resolved.get(placeId);
  if (known) {
    return known;
  }
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'geometry/location',
    language,
    sessiontoken: session,
    key: GOOGLE_MAPS_KEY,
  });
  const response = await fetch(`${BASE}/details/json?${params.toString()}`, {headers: HEADERS});
  session = newSession();
  if (!response.ok) {
    throw new Error(`Google ${response.status}`);
  }
  const payload = (await response.json()) as {
    status?: string;
    result?: {geometry?: {location?: {lat?: number; lng?: number}}};
  };
  const spot = payload.result?.geometry?.location;
  if (payload.status !== 'OK' || spot?.lat == null || spot.lng == null) {
    throw new Error(`Google ${payload.status ?? 'bad'}`);
  }
  const point = {latitude: spot.lat, longitude: spot.lng};
  resolved.set(placeId, point);
  return point;
}

function kindOf(types: string[]): string {
  if (types.includes('street_address') || types.includes('premise') || types.includes('subpremise')) {
    return 'house';
  }
  if (types.includes('locality') || types.includes('sublocality') || types.includes('administrative_area_level_1')) {
    return 'city';
  }
  if (types.includes('route') || types.includes('geocode')) {
    return 'street';
  }
  return 'poi';
}
