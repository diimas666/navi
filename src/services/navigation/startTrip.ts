import type {Place, RoutePlan} from '../../models/domain';
import {tripText} from '../../i18n/tripCopy';
import NativeLocationManager from '../../native/NativeLocationManager';
import NativeTripSession from '../../native/NativeTripSession';
import {useSessionStore} from '../../store/sessionStore';
import {useUiStore} from '../../store/uiStore';
import {planRoutes} from '../roads/Router';
import {routingGraph} from '../roads/RegionGraph';
import {streetRoutes} from '../roads/StreetRouter';
import {haversineMeters} from '../../utils/geo';
import {distanceToRoute, shouldRebuild} from './offRoute';
import {keepDistinctRoutes} from './routeChoice';

export type TripStart = 'ok' | 'denied' | 'failed' | 'missing';

const allowed = new Set(['authorizedAlways', 'authorizedWhenInUse']);
const FAR_FIX_M = 30_000;
const LOCAL_START_M = 50_000;

let rerouteAt = 0;
let rerouteKey = '';
let rerouteBusy = false;

export async function startOpenTrip(): Promise<TripStart> {
  const status = await NativeLocationManager?.requestWhenInUse();
  if (!status || !allowed.has(status)) {
    useUiStore.getState().showToast(tripText().noGps);
    return 'denied';
  }
  const started = await NativeTripSession?.startNavigation();
  if (!started) {
    useUiStore.getState().showToast(tripText().tripFail);
    return 'failed';
  }
  return 'ok';
}

export async function startTripTo(
  place: Place,
  origin?: {latitude: number; longitude: number} | null,
): Promise<TripStart> {
  const session = useSessionStore.getState();
  const originLat = session.displayLatitude ?? origin?.latitude ?? 50.4501;
  const originLon = session.displayLongitude ?? origin?.longitude ?? 30.5234;
  const routes = await collectRoutes(originLat, originLon, place.latitude, place.longitude);
  const planned = routes[0];
  if (!planned) {
    const note = tripText().noRoute;
    useSessionStore.getState().markRouteMissing(note);
    useUiStore.getState().showToast(note);
    return 'missing';
  }
  session.setAlternatives(routes);
  session.setFollow(false);
  session.setRoute(planned, place.name, {
    latitude: place.latitude,
    longitude: place.longitude,
  });
  const begin = planned.coordinates[0];
  if (
    begin &&
    session.displayLatitude != null &&
    session.displayLongitude != null &&
    haversineMeters(session.displayLatitude, session.displayLongitude, begin[1], begin[0]) > FAR_FIX_M
  ) {
    useSessionStore.getState().setDisplay(begin[1], begin[0], null, false, null);
  }
  return 'ok';
}

export async function confirmTrip(): Promise<TripStart> {
  return beginNavigation();
}

export async function planTrip(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): Promise<RoutePlan | null> {
  const routes = await collectRoutes(originLat, originLon, destinationLat, destinationLon);
  useSessionStore.getState().setAlternatives(routes);
  return routes[0] ?? null;
}

async function collectRoutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): Promise<RoutePlan[]> {
  const from = anchorOrigin(originLat, originLon, destinationLat, destinationLon);
  try {
    const alongStreets = await streetRoutes(from.latitude, from.longitude, destinationLat, destinationLon);
    const local = alongStreets.filter(route => startsNear(route, from.latitude, from.longitude));
    if (local.length > 0) {
      const reached = local.map(route => ({
        ...reachHouse(route, destinationLat, destinationLon),
        via: 'street' as const,
      }));
      return keepDistinctRoutes(reached);
    }
  } catch {
    // Street routing needs a network response. The saved graph is the fallback.
  }
  const offline = planRoutes(routingGraph(), from.latitude, from.longitude, destinationLat, destinationLon)
    .map(route => ({
      ...reachHouse(route, destinationLat, destinationLon),
      via: 'graph' as const,
    }))
    .filter(route => startsNear(route, from.latitude, from.longitude));
  if (offline.length > 0) {
    return keepDistinctRoutes(offline);
  }
  const approach = directApproach(from.latitude, from.longitude, destinationLat, destinationLon);
  return approach ? [approach] : [];
}

function anchorOrigin(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): {latitude: number; longitude: number} {
  const graph = routingGraph();
  if (graph.nearestNode(originLat, originLon)) {
    return {latitude: originLat, longitude: originLon};
  }
  const goal = graph.nearestNode(destinationLat, destinationLon);
  if (!goal) {
    return {latitude: originLat, longitude: originLon};
  }
  return {latitude: goal.lat, longitude: goal.lon};
}

function startsNear(route: RoutePlan, latitude: number, longitude: number): boolean {
  const begin = route.coordinates[0];
  if (!begin) {
    return false;
  }
  return haversineMeters(latitude, longitude, begin[1], begin[0]) <= LOCAL_START_M;
}

function directApproach(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): RoutePlan | null {
  const gap = haversineMeters(originLat, originLon, destinationLat, destinationLon);
  if (gap < 25 || gap > LOCAL_START_M) {
    return null;
  }
  return {
    distanceM: gap,
    durationS: gap / 12,
    via: 'graph',
    steps: [
      {
        name: '',
        distanceM: gap,
        alongM: 0,
        kind: 'depart',
        latitude: originLat,
        longitude: originLon,
      },
    ],
    coordinates: [
      [originLon, originLat],
      [destinationLon, destinationLat],
    ],
  };
}

function reachHouse(plan: RoutePlan, latitude: number, longitude: number): RoutePlan {
  const last = plan.coordinates[plan.coordinates.length - 1];
  if (!last) {
    return plan;
  }
  const gap = haversineMeters(last[1], last[0], latitude, longitude);
  if (gap < 25) {
    return plan;
  }
  return {
    ...plan,
    distanceM: plan.distanceM + gap,
    durationS: plan.durationS + gap / 12,
    coordinates: [...plan.coordinates, [longitude, latitude]],
  };
}

export async function rebuildIfOffRoute(
  latitude: number,
  longitude: number,
  speedMps: number,
  navigationActive: boolean,
): Promise<void> {
  if (!navigationActive || rerouteBusy) {
    return;
  }
  const session = useSessionStore.getState();
  const route = session.route;
  const destinationLat = session.destinationLatitude;
  const destinationLon = session.destinationLongitude;
  if (!route || destinationLat == null || destinationLon == null) {
    return;
  }
  const key = `${route.distanceM}:${route.coordinates.length}:${destinationLat}`;
  if (key !== rerouteKey) {
    rerouteKey = key;
    rerouteAt = Date.now();
    return;
  }
  const away = distanceToRoute(route.coordinates, latitude, longitude);
  if (!shouldRebuild(away, speedMps, Date.now() - rerouteAt)) {
    return;
  }
  rerouteBusy = true;
  rerouteAt = Date.now();
  try {
    const planned = await planTrip(latitude, longitude, destinationLat, destinationLon);
    const current = useSessionStore.getState();
    if (!planned || current.destinationLatitude !== destinationLat || current.destinationLongitude !== destinationLon) {
      return;
    }
    current.setRoute(planned, current.destinationName, {latitude: destinationLat, longitude: destinationLon});
  } finally {
    rerouteBusy = false;
  }
}

async function beginNavigation(): Promise<TripStart> {
  const status = await NativeLocationManager?.requestWhenInUse();
  if (!status || !allowed.has(status)) {
    useUiStore.getState().showToast(tripText().routeNeedGps);
    return 'denied';
  }
  const started = await NativeTripSession?.startNavigation();
  if (!started) {
    useUiStore.getState().showToast(tripText().routeKept);
    return 'failed';
  }
  return 'ok';
}
