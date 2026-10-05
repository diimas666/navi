import type {TripRecord} from '../../models/domain';
import {housesNear} from '../maps/houses';
import {matchToRoad} from '../roads/RoadMatcher';
import {routingGraph} from '../roads/RegionGraph';
import {haversineMeters} from '../../utils/geo';

const ROAD_LIMIT_M = 160;

export function looksLikeAddress(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /\d/u.test(value) || value.includes(',');
}

export function placeLabel(latitude: number, longitude: number): string {
  const house = nearestHouse(latitude, longitude, 220);
  if (house) {
    const street = [house.street, house.house].filter(part => part.length > 0).join(' ');
    return [street, house.city].filter(part => part.length > 0).join(', ');
  }
  const match = matchToRoad(routingGraph(), latitude, longitude, 80, 1);
  if (match && match.roadName && match.crossTrackM <= ROAD_LIMIT_M) {
    return match.roadName;
  }
  return '';
}

export function roadsAlong(track: TripRecord['track']): string[] {
  const names: string[] = [];
  if (track.length === 0) {
    return names;
  }
  const step = Math.max(1, Math.floor(track.length / 24));
  for (let index = 0; index < track.length; index += step) {
    pushRoad(names, track[index]);
  }
  pushRoad(names, track[track.length - 1]);
  return names.slice(0, 12);
}

export function enrichTrip(trip: TripRecord): TripRecord {
  const start = trip.track[0];
  const end = trip.track[trip.track.length - 1];
  const fromName = trip.fromName || (start ? placeLabel(start.latitude, start.longitude) : '');
  const toName = trip.toName || (end ? placeLabel(end.latitude, end.longitude) : '');
  const roads = trip.roads && trip.roads.length > 0 ? trip.roads : roadsAlong(trip.track);
  return {...trip, fromName, toName, roads};
}

export async function reversePlace(latitude: number, longitude: number, _language: 'uk' | 'ru'): Promise<string> {
  const url = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&lang=default`;
  const response = await fetch(url, {
    headers: {Accept: 'application/json', 'User-Agent': 'Navi/1.0 (offline navigator for Ukraine)'},
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    return '';
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const features = (payload as {features?: Array<{properties?: PhotonPlace}>}).features;
  const props = features?.[0]?.properties;
  if (!props) {
    return '';
  }
  const street = [props.street, props.housenumber].filter(part => part && part.length > 0).join(' ');
  const city = props.city || props.locality || '';
  const line = street || props.name || '';
  return [line, city].filter(part => part.length > 0).join(', ');
}

export function preferPlace(current: string | undefined, next: string): string {
  if (!next) {
    return current ?? '';
  }
  if (!current) {
    return next;
  }
  if (looksLikeAddress(current) && !looksLikeAddress(next)) {
    return current;
  }
  if (next.length > current.length) {
    return next;
  }
  return current;
}

type PhotonPlace = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  locality?: string;
};

function nearestHouse(latitude: number, longitude: number, limitM: number) {
  let best: ReturnType<typeof housesNear>[number] | null = null;
  let bestM = limitM;
  for (const house of housesNear(latitude, longitude, limitM / 111000)) {
    const distance = haversineMeters(latitude, longitude, house.latitude, house.longitude);
    if (distance < bestM) {
      best = house;
      bestM = distance;
    }
  }
  return best;
}

function pushRoad(names: string[], point: {latitude: number; longitude: number} | undefined): void {
  if (!point) {
    return;
  }
  const match = matchToRoad(routingGraph(), point.latitude, point.longitude, 80, 1);
  if (!match || !match.roadName || match.crossTrackM > ROAD_LIMIT_M) {
    return;
  }
  if (names[names.length - 1] === match.roadName) {
    return;
  }
  names.push(match.roadName);
}
