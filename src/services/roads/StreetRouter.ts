import type {RoutePlan} from '../../models/domain';
import {AppError} from '../errors/AppError';
import {tripText} from '../../i18n/tripCopy';
import {uiCopy} from '../../i18n/uiCopy';
import {geometryStartsNear} from '../navigation/placeFix';
import {useSettingsStore} from '../../store/settingsStore';

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
): Promise<RoutePlan[]> {
  const path = `${originLon},${originLat};${destinationLon},${destinationLat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true&alternatives=3&continue_straight=true`;
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
          maneuver?: {type?: string; modifier?: string; location?: [number, number]};
        }>;
      }>;
    }>;
  };
  if (record.code !== 'Ok' || !record.routes) {
    return [];
  }
  return record.routes
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
    .sort((left, right) => left.distanceM - right.distanceM);
}

function readSteps(
  raw: Array<{
    distance?: number;
    name?: string;
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
    const item = {
      name: step.name?.trim() || streets,
      distanceM: step.distance ?? 0,
      alongM,
      latitude: location?.[1],
      longitude: location?.[0],
      kind: step.maneuver?.type,
      modifier: step.maneuver?.modifier,
    };
    alongM += step.distance ?? 0;
    return item;
  });
}
