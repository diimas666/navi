import type {Place, RoutePlan} from '../../models/domain';
import {GOOGLE_MAPS_KEY} from '../../constants/googleMapsKey';
import {haversineMeters} from '../../utils/geo';
import {distanceToRoute} from './offRoute';
import {remainingCoordinates} from './maneuver';

export type AlongKind = 'gas' | 'parking' | 'food' | 'post';

export type AlongPlace = Place & {
  kind: AlongKind;
  extraM: number;
};

const TYPES: Record<AlongKind, {type?: string; keyword?: string}> = {
  gas: {type: 'gas_station'},
  parking: {type: 'parking'},
  food: {type: 'restaurant'},
  post: {keyword: 'Нова Пошта'},
};

const ALONG_M = 520;
const SAMPLE_EVERY_M = 2800;
const SAMPLE_CAP = 4;

export function sampleAlong(
  coordinates: Array<[number, number]>,
  everyM = SAMPLE_EVERY_M,
  cap = SAMPLE_CAP,
): Array<{latitude: number; longitude: number}> {
  if (coordinates.length < 2) {
    return [];
  }
  const points: Array<{latitude: number; longitude: number}> = [];
  let walked = 0;
  let nextAt = everyM;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1];
    const [lonB, latB] = coordinates[index];
    const gap = haversineMeters(latA, lonA, latB, lonB);
    walked += gap;
    if (walked >= nextAt) {
      points.push({latitude: latB, longitude: lonB});
      nextAt += everyM;
      if (points.length >= cap) {
        return points;
      }
    }
  }
  const last = coordinates[coordinates.length - 1];
  if (last && (points.length === 0 || haversineMeters(points[points.length - 1].latitude, points[points.length - 1].longitude, last[1], last[0]) > 400)) {
    points.push({latitude: last[1], longitude: last[0]});
  }
  return points.slice(0, cap);
}

export function rankAlong(route: RoutePlan, places: AlongPlace[]): AlongPlace[] {
  return places
    .map(place => ({...place, extraM: distanceToRoute(route.coordinates, place.latitude, place.longitude)}))
    .filter(place => place.extraM < ALONG_M)
    .sort((left, right) => left.extraM - right.extraM || (left.distanceM ?? 0) - (right.distanceM ?? 0));
}

export async function fetchAlongPlaces(
  route: RoutePlan,
  kind: AlongKind,
  here: {latitude: number; longitude: number},
  language: 'uk' | 'ru',
): Promise<AlongPlace[]> {
  if (GOOGLE_MAPS_KEY.length < 20) {
    return [];
  }
  const samples = sampleAlong(remainingCoordinates(route.coordinates, here.latitude, here.longitude));
  const batches = await Promise.all(samples.map(sample => oneQuery(kind, sample.latitude, sample.longitude, language)));
  const seen = new Set<string>();
  const merged: AlongPlace[] = [];
  batches.flat().forEach(place => {
    if (seen.has(place.id)) {
      return;
    }
    seen.add(place.id);
    merged.push({
      ...place,
      distanceM: haversineMeters(here.latitude, here.longitude, place.latitude, place.longitude),
      extraM: 0,
    });
  });
  return rankAlong(route, merged).slice(0, 8);
}

async function oneQuery(
  kind: AlongKind,
  latitude: number,
  longitude: number,
  language: 'uk' | 'ru',
): Promise<AlongPlace[]> {
  const spec = TYPES[kind];
  const params = new URLSearchParams({
    location: `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    radius: '900',
    language,
    key: GOOGLE_MAPS_KEY,
  });
  if (spec.type) {
    params.set('type', spec.type);
  }
  if (spec.keyword) {
    params.set('keyword', spec.keyword);
  }
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`);
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      place_id?: string;
      name?: string;
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
        extraM: 0,
      },
    ];
  });
}
