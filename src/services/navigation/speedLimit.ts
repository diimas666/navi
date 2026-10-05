import type {RoutePlan} from '../../models/domain';
import {haversineMeters, projectOntoSegment} from '../../utils/geo';
import {routingGraph} from '../roads/RegionGraph';

/** Ukraine defaults when OSM maxspeed is missing. Safer urban numbers over highway guesses. */
export function highwayLimitKmh(highway: string): number {
  if (highway === 'motorway' || highway === 'motorway_link') {
    return 130;
  }
  if (highway === 'trunk' || highway === 'trunk_link') {
    return 110;
  }
  if (
    highway === 'primary' ||
    highway === 'primary_link' ||
    highway === 'secondary' ||
    highway === 'secondary_link'
  ) {
    return 90;
  }
  if (highway === 'living_street') {
    return 20;
  }
  if (highway === 'service' || highway === 'track') {
    return 20;
  }
  return 50;
}

export function parseMaxspeed(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 200) {
    return Math.round(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.match(/(\d{2,3})/);
  if (!match) {
    return null;
  }
  const kmh = Number(match[1]);
  return kmh > 0 && kmh < 200 ? kmh : null;
}

export function speedLimitKmh(
  latitude: number,
  longitude: number,
  route?: RoutePlan | null,
): number | null {
  const fromStep = stepLimit(route, latitude, longitude);
  if (fromStep != null) {
    return fromStep;
  }
  const edge = nearestHighway(latitude, longitude);
  if (!edge) {
    return null;
  }
  return highwayLimitKmh(edge);
}

function stepLimit(route: RoutePlan | null | undefined, latitude: number, longitude: number): number | null {
  if (!route || route.steps.length === 0) {
    return null;
  }
  let best = Number.POSITIVE_INFINITY;
  let hit: number | null = null;
  for (const step of route.steps) {
    const lat = step.latitude;
    const lon = step.longitude;
    if (lat == null || lon == null || step.speedKmh == null) {
      continue;
    }
    const away = haversineMeters(latitude, longitude, lat, lon);
    if (away < best) {
      best = away;
      hit = step.speedKmh;
    }
  }
  return best < 240 ? hit : null;
}

function nearestHighway(latitude: number, longitude: number): string | null {
  let best = Number.POSITIVE_INFINITY;
  let highway: string | null = null;
  routingGraph()
    .edgesNear(latitude, longitude)
    .forEach(edge => {
      const line = edge.coordinates;
      for (let index = 1; index < line.length; index += 1) {
        const [startLon, startLat] = line[index - 1];
        const [endLon, endLat] = line[index];
        const point = projectOntoSegment(latitude, longitude, startLat, startLon, endLat, endLon);
        if (point.distanceM < best) {
          best = point.distanceM;
          highway = edge.highway;
        }
      }
    });
  return best < 40 ? highway : null;
}
