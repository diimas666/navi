import type {RoutePlan} from '../../models/domain';
import {haversineMeters} from '../../utils/geo';
import {distanceToRoute} from './offRoute';

export function keepDistinctRoutes(routes: RoutePlan[]): RoutePlan[] {
  const primary = routes[0];
  if (!primary) {
    return [];
  }
  const rest = routes.slice(1).filter(route => isSeparateRoad(primary, route));
  return [primary, ...rest].slice(0, 3);
}

function isSeparateRoad(primary: RoutePlan, other: RoutePlan): boolean {
  if (other.coordinates.length < 2 || primary.coordinates.length < 2) {
    return false;
  }
  const extra = (other.distanceM - primary.distanceM) / Math.max(primary.distanceM, 1);
  if (extra > 0.15) {
    return false;
  }
  const longTrip = primary.distanceM >= 80000;
  const corridorM = longTrip ? 4000 : 700;
  const samples = sampleRoute(other.coordinates, longTrip ? 4000 : 400);
  let farM = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const [lon, lat] = samples[index];
    const away = distanceToRoute(primary.coordinates, lat, lon);
    if (away <= corridorM) {
      continue;
    }
    const [prevLon, prevLat] = samples[index - 1];
    farM += haversineMeters(prevLat, prevLon, lat, lon);
  }
  const needed = longTrip ? Math.max(30000, primary.distanceM * 0.1) : Math.max(1200, primary.distanceM * 0.18);
  return farM >= needed;
}

function sampleRoute(coordinates: Array<[number, number]>, stepM: number): Array<[number, number]> {
  const samples: Array<[number, number]> = [coordinates[0]];
  let walked = 0;
  let nextAt = stepM;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon, lat] = coordinates[index];
    const [prevLon, prevLat] = coordinates[index - 1];
    const span = haversineMeters(prevLat, prevLon, lat, lon);
    walked += span;
    if (walked >= nextAt) {
      samples.push(coordinates[index]);
      nextAt = walked + stepM;
    }
  }
  const last = coordinates[coordinates.length - 1];
  const tail = samples[samples.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) {
    samples.push(last);
  }
  return samples;
}

export function isAirLine(route: RoutePlan, limitM = 90): boolean {
  const start = route.coordinates[0];
  const end = route.coordinates[route.coordinates.length - 1];
  if (!start || !end) {
    return true;
  }
  const straight = haversineMeters(start[1], start[0], end[1], end[0]);
  if (straight <= limitM) {
    return false;
  }
  if (route.coordinates.length <= 3) {
    return true;
  }
  return route.distanceM <= straight * 1.06 && route.coordinates.length < 8;
}

export function dropPassedStops<T extends {latitude: number; longitude: number}>(
  stops: T[],
  latitude: number,
  longitude: number,
  limitM = 70,
): T[] {
  const hit = stops.findIndex(stop => haversineMeters(latitude, longitude, stop.latitude, stop.longitude) < limitM);
  if (hit < 0) {
    return stops;
  }
  return stops.slice(hit + 1);
}
