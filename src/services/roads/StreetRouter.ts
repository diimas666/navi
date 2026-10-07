import type {LaneHint, RoutePlan} from '../../models/domain';
import {uiCopy} from '../../i18n/uiCopy';
import {geometryStartsNear} from '../navigation/placeFix';
import {googleDrivingReady, googleDrivingRoutes} from './GoogleRouter';
import {useSettingsStore} from '../../store/settingsStore';
import {bearingDegrees, haversineMeters} from '../../utils/geo';

const OSRM_HOSTS = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];

type RawStep = {
  distance?: number;
  name?: string;
  geometry?: {coordinates?: Array<[number, number]>};
  maneuver?: {type?: string; modifier?: string; location?: [number, number]; exit?: number};
  intersections?: Array<{
    lanes?: Array<{indications?: string[]; valid?: boolean}>;
  }>;
};

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
  stops: Array<{latitude: number; longitude: number}> = [],
): Promise<RoutePlan[]> {
  const points = [
    [originLon, originLat],
    ...stops.map(stop => [stop.longitude, stop.latitude]),
    [destinationLon, destinationLat],
  ];
  if (googleDrivingReady()) {
    try {
      const google = await googleDrivingRoutes(originLat, originLon, destinationLat, destinationLon, stops);
      if (google.length > 0) {
        return google.sort((left, right) => routeRank(left, heading) - routeRank(right, heading));
      }
    } catch {
      // Google Directions can be restricted. OSRM still answers.
    }
  }
  const ranked = await osrmRoutes(points, heading, stops.length > 0);
  if (ranked.length === 0 && heading != null) {
    return osrmRoutes(points, null, stops.length > 0);
  }
  return ranked;
}

async function osrmRoutes(
  points: number[][],
  heading?: number | null,
  hasStops = false,
): Promise<RoutePlan[]> {
  const path = points.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    alternatives: hasStops ? 'false' : '3',
    approaches: points.map(() => 'unrestricted').join(';'),
    radiuses: points.map(() => '120').join(';'),
    continue_straight: 'false',
  });
  if (heading != null && Number.isFinite(heading)) {
    const face = ((Math.round(heading) % 360) + 360) % 360;
    const rest = points.slice(1).map(() => '');
    params.set('bearings', [`${face},80`, ...rest].join(';'));
  }
  for (const host of OSRM_HOSTS) {
    try {
      const response = await fetch(`${host}/route/v1/driving/${path}?${params.toString()}`, {
        headers: {Accept: 'application/json', 'User-Agent': 'Navi/1.0 (offline navigator for Ukraine)'},
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        continue;
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        continue;
      }
      const record = payload as {
        code?: string;
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: {coordinates?: Array<[number, number]>};
          legs?: Array<{
            steps?: RawStep[];
          }>;
        }>;
      };
      if (record.code !== 'Ok' || !record.routes) {
        continue;
      }
      const ranked = record.routes
        .map(route => {
          const coordinates = route.geometry?.coordinates;
          const origin = points[0];
          if (
            !coordinates ||
            coordinates.length < 2 ||
            !origin ||
            !geometryStartsNear(coordinates, origin[1], origin[0], 80_000)
          ) {
            return null;
          }
          const distanceM = route.distance ?? 0;
          const plan: RoutePlan = {
            distanceM,
            durationS: route.duration ?? 0,
            steps: readSteps(route.legs?.flatMap(leg => leg.steps ?? []), distanceM),
            coordinates,
            via: 'street',
          };
          return plan;
        })
        .filter((route): route is RoutePlan => route != null)
        .sort((left, right) => routeRank(left, heading) - routeRank(right, heading));
      if (ranked.length > 0) {
        return ranked;
      }
    } catch {
      // The next public router still has a chance.
    }
  }
  return [];
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

function readSteps(raw: RawStep[] | undefined, distanceM: number) {
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
      exit: step.maneuver?.exit,
      lanes: readLanes(step.intersections),
    };
    alongM += step.distance ?? 0;
    return item;
  });
}

function readLanes(
  intersections: Array<{lanes?: Array<{indications?: string[]; valid?: boolean}>}> | undefined,
): LaneHint[] | undefined {
  const lanes = intersections?.find(item => item.lanes && item.lanes.length > 0)?.lanes;
  if (!lanes || lanes.length === 0) {
    return undefined;
  }
  const hints = lanes.map(lane => ({
    valid: lane.valid === true,
    indication: laneSide(lane.indications?.[0] ?? ''),
  }));
  return hints.some(item => item.valid) ? hints : undefined;
}

function laneSide(value: string): LaneHint['indication'] {
  if (value.includes('uturn')) {
    return 'uturn';
  }
  if (value.includes('left')) {
    return 'left';
  }
  if (value.includes('right')) {
    return 'right';
  }
  return 'straight';
}
