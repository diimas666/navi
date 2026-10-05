import type {RoutePlan} from '../../models/domain';
import {AppError} from '../errors/AppError';
import {tripText} from '../../i18n/tripCopy';
import {uiCopy} from '../../i18n/uiCopy';
import {geometryStartsNear} from '../navigation/placeFix';
import {useSettingsStore} from '../../store/settingsStore';
import {bearingDegrees, haversineMeters} from '../../utils/geo';

export async function streetRoute(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): Promise<RoutePlan | null> {
  const routes = await streetRoutes(originLat, originLon, destinationLat, destinationLon);
  return routes[0] ?? null;
}

export async function streetRoutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  heading?: number | null,
): Promise<RoutePlan[]> {
  const path = `${originLon},${originLat};${destinationLon},${destinationLat}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    alternatives: '3',
    approaches: 'unrestricted;unrestricted',
    continue_straight: 'false',
  });
  if (heading != null && Number.isFinite(heading)) {
    const face = ((Math.round(heading) % 360) + 360) % 360;
    params.set('bearings', `${face},80;`);
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {Accept: 'application/json', 'User-Agent': 'Navi/1.0 (offline navigator for Ukraine)'},
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new AppError('MAP_ERROR', `OSRM ${response.status}`, tripText().noRoute);
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as {
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: {coordinates?: Array<[number, number]>};
      legs?: Array<{
        steps?: Array<{
          distance?: number;
          name?: string;
          geometry?: {coordinates?: Array<[number, number]>};
          maneuver?: {type?: string; modifier?: string; location?: [number, number]};
        }>;
      }>;
    }>;
  };
  if (record.code !== 'Ok' || !record.routes) {
    if (heading != null) {
      return streetRoutes(originLat, originLon, destinationLat, destinationLon, null);
    }
    return [];
  }
  const ranked = record.routes
    .map(route => {
      const coordinates = route.geometry?.coordinates;
      if (!coordinates || coordinates.length < 2 || !geometryStartsNear(coordinates, originLat, originLon)) {
        return null;
      }
      const distanceM = route.distance ?? 0;
      const plan: RoutePlan = {
        distanceM,
        durationS: route.duration ?? 0,
        steps: readSteps(route.legs?.[0]?.steps, distanceM),
        coordinates,
      };
      return plan;
    })
    .filter((route): route is RoutePlan => route != null)
    .sort((left, right) => routeRank(left, heading) - routeRank(right, heading));
  if (ranked.length === 0 && heading != null) {
    return streetRoutes(originLat, originLon, destinationLat, destinationLon, null);
  }
  return ranked;
}

function routeRank(route: RoutePlan, heading?: number | null): number {
  const wrongWay = departureDelta(route.coordinates, heading);
  return route.distanceM + (wrongWay > 110 ? 350 : 0);
}

function departureDelta(coordinates: Array<[number, number]>, heading?: number | null): number {
  if (heading == null || !Number.isFinite(heading) || coordinates.length < 2) {
    return 0;
  }
  const [startLon, startLat] = coordinates[0];
  let endLon = coordinates[1][0];
  let endLat = coordinates[1][1];
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon, lat] = coordinates[index];
    if (haversineMeters(startLat, startLon, lat, lon) >= 35) {
      endLon = lon;
      endLat = lat;
      break;
    }
  }
  let delta = Math.abs(bearingDegrees(startLat, startLon, endLat, endLon) - heading);
  if (delta > 180) {
    delta = 360 - delta;
  }
  return delta;
}

function readSteps(
  raw: Array<{
    distance?: number;
    name?: string;
    geometry?: {coordinates?: Array<[number, number]>};
    maneuver?: {type?: string; modifier?: string; location?: [number, number]};
  }> | undefined,
  distanceM: number,
) {
  const streets = uiCopy(useSettingsStore.getState().language).streets;
  if (!raw || raw.length === 0) {
    return [{name: streets, distanceM, alongM: 0, kind: 'depart'}];
  }
  let alongM = 0;
  return raw.map(step => {
    const location = step.maneuver?.location;
    const line = step.geometry?.coordinates;
    const item = {
      name: step.name?.trim() || streets,
      distanceM: step.distance ?? 0,
      alongM,
      latitude: location?.[1],
      longitude: location?.[0],
      coordinates: line && line.length > 1 ? line : undefined,
      kind: step.maneuver?.type,
      modifier: step.maneuver?.modifier,
    };
    alongM += step.distance ?? 0;
    return item;
  });
}
