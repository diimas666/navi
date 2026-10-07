import type {Place, RoutePlan} from '../../models/domain';
import {tripText} from '../../i18n/tripCopy';
import NativeLocationManager from '../../native/NativeLocationManager';
import NativeTripSession from '../../native/NativeTripSession';
import {useSessionStore} from '../../store/sessionStore';
import {useUiStore} from '../../store/uiStore';
import {planRoutes} from '../roads/Router';
import {routingGraph} from '../roads/RegionGraph';
import {streetRoutes} from '../roads/StreetRouter';
import {haversineMeters, projectOntoSegment} from '../../utils/geo';
import {placeFix} from './placeFix';
import {distanceToRoute, shouldRebuild} from './offRoute';
import {keepDistinctRoutes, dropPassedStops, isAirLine, rankRoutes} from './routeChoice';
import {useSettingsStore} from '../../store/settingsStore';
import {matchesStreet} from '../maps/addressQuery';
import {planThroughStops} from './joinPlans';

export type TripStart = 'ok' | 'denied' | 'failed' | 'missing';

const allowed = new Set(['authorizedAlways', 'authorizedWhenInUse']);
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
  const here = await hereNow();
  const originLat = here?.latitude ?? session.displayLatitude ?? origin?.latitude ?? null;
  const originLon = here?.longitude ?? session.displayLongitude ?? origin?.longitude ?? null;
  if (originLat == null || originLon == null) {
    useUiStore.getState().showToast(tripText().noGps);
    return 'denied';
  }
  if (
    session.displayLatitude == null ||
    session.displayLongitude == null ||
    haversineMeters(session.displayLatitude, session.displayLongitude, originLat, originLon) > 400
  ) {
    useSessionStore.getState().setDisplay(originLat, originLon, null, false, null);
  }
  const routes = await collectRoutes(originLat, originLon, place.latitude, place.longitude, place.name);
  const planned = routes[0];
  if (!planned) {
    const note = tripText().noRoute;
    useSessionStore.getState().markRouteMissing(note);
    useUiStore.getState().showToast(note);
    return 'missing';
  }
  session.setAlternatives(routes);
  if (!session.driving) {
    session.setFollow(false);
  }
  session.setRoute(planned, place.name, {
    latitude: place.latitude,
    longitude: place.longitude,
  });
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

async function hereNow(): Promise<{latitude: number; longitude: number} | null> {
  const fix = await NativeLocationManager?.getLatestFix().catch(() => null);
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
    return null;
  }
  if (Math.abs(fix.latitude) < 0.2 && Math.abs(fix.longitude) < 0.2) {
    return null;
  }
  if (fix.horizontalAccuracy < 0 || fix.horizontalAccuracy > 250) {
    return null;
  }
  const age = Date.now() - fix.timestamp;
  if (!Number.isFinite(age) || age < 0 || age > 180_000) {
    return null;
  }
  const stood = placeFix(fix.latitude, fix.longitude);
  return {latitude: stood.latitude, longitude: stood.longitude};
}

async function collectRoutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  placeName = '',
): Promise<RoutePlan[]> {
  const from = {latitude: originLat, longitude: originLon};
  const straight = haversineMeters(originLat, originLon, destinationLat, destinationLon);
  const heading = departHeading();
  const stops = dropPassedStops(useSessionStore.getState().stops, originLat, originLon);
  if (stops.length !== useSessionStore.getState().stops.length) {
    useSessionStore.getState().setStops(stops);
  }
  const finish = (route: RoutePlan, via: RoutePlan['via']): RoutePlan => ({
    ...nameArrival(reachHouse(route, destinationLat, destinationLon), placeName),
    via,
  });
  let street: RoutePlan[] = [];
  try {
    const alongStreets = await streetRoutes(originLat, originLon, destinationLat, destinationLon, heading, stops);
    street = alongStreets
      .filter(route => startsNear(route, originLat, originLon))
      .map(route => finish(route, 'street'));
  } catch {
    // Street routing needs a network response. The saved graph is the fallback.
  }
  const offline = planThroughStops(routingGraph(), originLat, originLon, destinationLat, destinationLon, stops)
    .map(route => finish(route, 'graph'))
    .filter(route => startsNear(route, originLat, originLon));
  const pref = useSettingsStore.getState().routePref;
  const streetOk = rankRoutes(
    street.filter(route => !isAirLine(route)),
    pref,
  );
  if (streetOk.length > 0 && !(stops.length === 0 && straight < 900 && isLongLoop(streetOk[0], straight))) {
    return keepDistinctRoutes(streetOk);
  }
  let pool = rankRoutes([...streetOk, ...offline.filter(route => !isAirLine(route))], pref);
  if (stops.length === 0 && straight < 900 && isLongLoop(pool[0], straight)) {
    const curb = nearerCurb(destinationLat, destinationLon, originLat, originLon);
    if (curb) {
      try {
        const retry = (
          await streetRoutes(originLat, originLon, curb.latitude, curb.longitude, heading)
        )
          .filter(route => startsNear(route, originLat, originLon))
          .map(route => finish(route, 'street'));
        pool = rankRoutes([...retry, ...pool].filter(route => !isAirLine(route)), pref);
      } catch {
        // The first street answer stays if the nearer curb request fails.
      }
      const graphRetry = planRoutes(routingGraph(), originLat, originLon, curb.latitude, curb.longitude)
        .map(route => finish(route, 'graph'))
        .filter(route => startsNear(route, originLat, originLon));
      pool = rankRoutes([...graphRetry, ...pool].filter(route => !isAirLine(route)), pref);
    }
  }
  if (pool.length > 0) {
    const streets = rankRoutes(
      pool.filter(route => route.via === 'street'),
      pref,
    );
    return keepDistinctRoutes(streets.length > 0 ? streets : pool);
  }
  const approach = directApproach(from.latitude, from.longitude, destinationLat, destinationLon);
  return approach ? [approach] : [];
}

function isLongLoop(route: RoutePlan | undefined, straight: number): boolean {
  if (!route) {
    return true;
  }
  return route.distanceM > Math.max(straight * 2.1, straight + 180);
}

function nearerCurb(
  destinationLat: number,
  destinationLon: number,
  originLat: number,
  originLon: number,
): {latitude: number; longitude: number} | null {
  let best: {latitude: number; longitude: number} | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  routingGraph()
    .edgesNear(destinationLat, destinationLon)
    .forEach(edge => {
      const line = edge.coordinates;
      for (let index = 1; index < line.length; index += 1) {
        const [startLon, startLat] = line[index - 1];
        const [endLon, endLat] = line[index];
        const point = projectOntoSegment(destinationLat, destinationLon, startLat, startLon, endLat, endLon);
        const toPlace = point.distanceM;
        if (toPlace > 220) {
          continue;
        }
        const toCar = haversineMeters(originLat, originLon, point.latitude, point.longitude);
        const score = toPlace + toCar * 0.45;
        if (score < bestScore) {
          bestScore = score;
          best = {latitude: point.latitude, longitude: point.longitude};
        }
      }
    });
  return best;
}

function departHeading(): number | null {
  const snap = useSessionStore.getState().snapshot;
  if (!snap || !Number.isFinite(snap.heading) || snap.speedMps < 1.2) {
    return null;
  }
  return snap.heading;
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
  if (gap < 25 || gap > 90) {
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

function nameArrival(plan: RoutePlan, placeName: string): RoutePlan {
  const street = placeName.split(',')[0]?.trim() ?? '';
  if (street.length < 3) {
    return plan;
  }
  const last = plan.steps[plan.steps.length - 1];
  if (last && matchesStreet(last.name, street)) {
    return plan;
  }
  const end = plan.coordinates[plan.coordinates.length - 1];
  const steps = [...plan.steps];
  if (last && last.distanceM === 0) {
    steps[steps.length - 1] = {...last, name: street};
  } else {
    steps.push({
      name: street,
      distanceM: 0,
      alongM: plan.distanceM,
      kind: 'arrive',
      latitude: end?.[1],
      longitude: end?.[0],
    });
  }
  return {...plan, steps};
}

function reachHouse(plan: RoutePlan, latitude: number, longitude: number): RoutePlan {
  const last = plan.coordinates[plan.coordinates.length - 1];
  if (!last) {
    return plan;
  }
  const gap = haversineMeters(last[1], last[0], latitude, longitude);
  if (gap < 25 || gap > 90) {
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
