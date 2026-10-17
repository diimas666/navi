import type {RoutePlan} from '../../models/domain';
import {haversineMeters, projectOntoSegment} from '../../utils/geo';
import {housesNear} from '../maps/houses';
import {parseMaxspeed} from '../roads/maxspeed';
import {routingGraph} from '../roads/RegionGraph';
import {bundledGraph} from '../roads/RoadGraph';

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

export {parseMaxspeed};

const URBAN_KMH = 50;

/**
 * Posted limit from OSM when the road has one. Otherwise a class default, never above 50 km/h
 * inside a town: Ukrainian rules set 50 in settlements unless a sign says otherwise.
 */
export function speedLimitKmh(
  latitude: number,
  longitude: number,
  route?: RoutePlan | null,
): number | null {
  const edge = nearestEdge(latitude, longitude);
  if (edge?.maxspeed != null) {
    return edge.maxspeed;
  }
  const guess = stepLimit(route, latitude, longitude) ?? (edge ? highwayLimitKmh(edge.highway) : null);
  if (guess == null) {
    return null;
  }
  return guess > URBAN_KMH && inSettlement(latitude, longitude) ? URBAN_KMH : guess;
}

/** Regional centres from the bundled graph. Its trunk corridors start right at the city centre. */
const CITY_CENTRES = bundledGraph.nodes.filter(node => node.kind === 'city');
const CITY_RADIUS_M = 7000;

/** A regional centre, dense addresses or several residential streets around the car mean a town. */
export function inSettlement(latitude: number, longitude: number): boolean {
  if (CITY_CENTRES.some(city => haversineMeters(latitude, longitude, city.lat, city.lon) < CITY_RADIUS_M)) {
    return true;
  }
  if (housesNear(latitude, longitude, 0.003).length >= 10) {
    return true;
  }
  let residential = 0;
  for (const edge of routingGraph().edgesNear(latitude, longitude)) {
    if (edge.highway !== 'residential' && edge.highway !== 'living_street') {
      continue;
    }
    if (distanceToEdge(edge.coordinates, latitude, longitude) < 300) {
      residential += 1;
      if (residential >= 6) {
        return true;
      }
    }
  }
  return false;
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

function nearestEdge(latitude: number, longitude: number): {highway: string; maxspeed?: number} | null {
  let best = Number.POSITIVE_INFINITY;
  let found: {highway: string; maxspeed?: number} | null = null;
  routingGraph()
    .edgesNear(latitude, longitude)
    .forEach(edge => {
      const away = distanceToEdge(edge.coordinates, latitude, longitude);
      if (away < best) {
        best = away;
        found = edge;
      }
    });
  return best < 40 ? found : null;
}

function distanceToEdge(line: Array<[number, number]>, latitude: number, longitude: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const [startLon, startLat] = line[index - 1];
    const [endLon, endLat] = line[index];
    best = Math.min(best, projectOntoSegment(latitude, longitude, startLat, startLon, endLat, endLon).distanceM);
  }
  return best;
}
