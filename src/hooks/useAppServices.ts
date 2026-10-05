import {useEffect, useRef} from 'react';
import NetInfo from '@react-native-community/netinfo';

import type {TripRecord, TrustLevel} from '../models/domain';
import NativeOBDManager from '../native/NativeOBDManager';
import NativeTripSession from '../native/NativeTripSession';
import {syncDrAllowance} from '../services/entitlements/EntitlementService';
import {loadRegionState, completeMissingHouses} from '../services/maps/OfflineMapService';
import {loadRegionRoads} from '../services/roads/RegionRoads';
import {loadAllHouses} from '../services/maps/houseDownload';
import {routingGraph} from '../services/roads/RegionGraph';
import {keepDistinctRoutes} from '../services/navigation/routeChoice';
import {decidePark, type ParkMemory} from '../services/navigation/parkHold';
import {distanceToRoute} from '../services/navigation/offRoute';
import {geometryStartsNear, placeFix} from '../services/navigation/placeFix';
import {planTrip, rebuildIfOffRoute} from '../services/navigation/startTrip';
import {loadPlaces} from '../services/places/PlacesRepository';
import {matchToRoad} from '../services/roads/RoadMatcher';
import {settleMarker} from '../services/navigation/markerSettle';
import {streetRoutes} from '../services/roads/StreetRouter';
import {loadSettings, saveSettings, selectPersisted} from '../services/settings/SettingsRepository';
import {loadTrips, saveTrips} from '../services/trips/TripRepository';
import {enrichTrip, preferPlace} from '../services/trips/tripPlace';
import {useMapStore} from '../store/mapStore';
import {usePlacesStore} from '../store/placesStore';
import {useObdStore} from '../store/obdStore';
import {useSessionStore} from '../store/sessionStore';
import {useSettingsStore} from '../store/settingsStore';
import {useTripStore} from '../store/tripStore';
import {haversineMeters} from '../utils/geo';

const track: TripRecord['track'] = [];
let tripStartedAt = 0;
let gpsDistance = 0;
let drDistance = 0;
let maxSpeed = 0;
let lastPoint: {latitude: number; longitude: number; source: string} | null = null;
let lastShownAt = 0;
let notedTo = '';
let parkMemory: ParkMemory = {stillSince: 0, anchorLatitude: null, anchorLongitude: null};

export function useAppServices(): void {
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      const [settings, trips, regions, places] = await Promise.all([
        loadSettings(),
        loadTrips(),
        loadRegionState(),
        loadPlaces(),
      ]);
      if (!alive) {
        return;
      }
      useSettingsStore.getState().hydrate({...settings, hydrated: true});
      useTripStore.getState().setTrips(trips);
      useMapStore.getState().hydrateRegions(regions);
      usePlacesStore.getState().hydrate(places);
      await loadRegionRoads().catch(() => undefined);
      await loadAllHouses().catch(() => undefined);
      NativeTripSession?.startPreview();
      syncDrAllowance();
      hydrated.current = true;
      completeMissingHouses().catch(() => undefined);
    };
    boot().catch(() => {
      useSettingsStore.getState().setHydrated(true);
    });

    const settingsSub = useSettingsStore.subscribe(state => {
      if (!hydrated.current) {
        return;
      }
      saveSettings(selectPersisted(state)).catch(() => undefined);
      syncDrAllowance();
    });
    let wasOnline = false;
    const applyLink = (state: {isConnected: boolean | null; isInternetReachable: boolean | null}) => {
      const online = linkUp(state);
      if (online == null) {
        return;
      }
      const regained = online && !wasOnline;
      wasOnline = online;
      useMapStore.getState().setOnline(online);
      if (regained) {
        upgradeStreetRoute().catch(() => undefined);
      }
    };
    const netSub = NetInfo.addEventListener(applyLink);
    NetInfo.fetch().then(applyLink).catch(() => undefined);
    const probe = setInterval(() => {
      NetInfo.refresh().then(applyLink).catch(() => undefined);
    }, 4000);
    const obd = NativeOBDManager;
    const deviceSub = obd?.onDevice(device => useObdStore.getState().upsertDevice(device));
    const stateSub = obd?.onState(event => useObdStore.getState().setState(event.state, event.message));
    const dataSub = obd?.onData(snapshot => useObdStore.getState().setSnapshot(snapshot));
    const sessionSub = NativeTripSession?.onSnapshot(snapshot => {
      const trust = snapshot.trust as TrustLevel;
      const stood = placeFix(snapshot.latitude, snapshot.longitude);
      let latitude = stood.latitude;
      let longitude = stood.longitude;
      let roadName: string | null = null;
      let applied = false;
      let crossTrackM: number | null = null;
      if (snapshot.hasEstimate && (snapshot.source === 'dr' || snapshot.source === 'blended')) {
        const match = matchToRoad(
          routingGraph(),
          latitude,
          longitude,
          snapshot.accuracy,
          snapshot.confidence,
        );
        if (match) {
          latitude = match.latitude;
          longitude = match.longitude;
          roadName = match.roadName;
          applied = match.applied;
          crossTrackM = match.crossTrackM;
        }
      }
      useSessionStore.getState().setSnapshot({...snapshot, trust, latitude, longitude});
      if (stood.replaced) {
        useSessionStore.getState().setDisplay(latitude, longitude, null, false, null);
        recoverFarRoute(latitude, longitude);
      }
      const routeLine = useSessionStore.getState().route?.coordinates;
      const fixLeavesRoute =
        routeLine != null && routeLine.length > 1 && distanceToRoute(routeLine, latitude, longitude) > 30_000;
      const placed = useSessionStore.getState().displayLatitude != null;
      const carried =
        placed && (snapshot.source === 'dr' || snapshot.source === 'blended' || snapshot.source === 'held');
      if (!stood.replaced && !fixLeavesRoute && snapshot.hasEstimate && (snapshot.hasGps || carried)) {
        const held = holdOrFollow(snapshot, latitude, longitude);
        const session = useSessionStore.getState();
        const now = Date.now();
        const gapS = lastShownAt > 0 ? (now - lastShownAt) / 1000 : 0;
        lastShownAt = now;
        const shown = session.locked
          ? held
          : settleMarker({
              fromLatitude: session.displayLatitude,
              fromLongitude: session.displayLongitude,
              latitude: held.latitude,
              longitude: held.longitude,
              gapS,
              speedMps: snapshot.speedMps,
              trustFix:
                useMapStore.getState().online && (snapshot.source === 'gps' || snapshot.source === 'blended'),
            });
        session.setDisplay(shown.latitude, shown.longitude, roadName, applied, crossTrackM);
        rememberPoint(snapshot, shown.latitude, shown.longitude);
        rememberCalibration(snapshot);
        rebuildIfOffRoute(shown.latitude, shown.longitude, snapshot.speedMps, snapshot.navigationActive).catch(
          () => undefined,
        );
      }
      if (!snapshot.navigationActive && track.length > 1) {
        flushTrip();
      }
    });

    return () => {
      alive = false;
      settingsSub();
      netSub();
      clearInterval(probe);
      deviceSub?.remove();
      stateSub?.remove();
      dataSub?.remove();
      sessionSub?.remove();
    };
  }, []);
}

function linkUp(state: {isConnected: boolean | null; isInternetReachable: boolean | null}): boolean | null {
  if (state.isConnected == null && state.isInternetReachable == null) {
    return null;
  }
  if (state.isConnected === false) {
    return false;
  }
  if (state.isConnected === true) {
    return true;
  }
  if (state.isInternetReachable === false) {
    return false;
  }
  if (state.isInternetReachable === true) {
    return true;
  }
  return null;
}

let recoveringRoute = false;

function recoverFarRoute(latitude: number, longitude: number): void {
  const session = useSessionStore.getState();
  const route = session.route;
  const destinationLat = session.destinationLatitude;
  const destinationLon = session.destinationLongitude;
  if (recoveringRoute || !route || destinationLat == null || destinationLon == null) {
    return;
  }
  if (geometryStartsNear(route.coordinates, latitude, longitude, 50_000)) {
    return;
  }
  recoveringRoute = true;
  planTrip(latitude, longitude, destinationLat, destinationLon)
    .then(planned => {
      const current = useSessionStore.getState();
      if (current.destinationLatitude !== destinationLat || current.destinationLongitude !== destinationLon) {
        return;
      }
      if (!planned || !geometryStartsNear(planned.coordinates, latitude, longitude, 50_000)) {
        current.resetRoute();
        return;
      }
      current.setFollow(false);
      current.setRoute(planned, current.destinationName, {latitude: destinationLat, longitude: destinationLon});
    })
    .finally(() => {
      recoveringRoute = false;
    });
}

async function upgradeStreetRoute(): Promise<void> {
  const session = useSessionStore.getState();
  const route = session.route;
  const latitude = session.destinationLatitude;
  const longitude = session.destinationLongitude;
  const originLat = session.displayLatitude;
  const originLon = session.displayLongitude;
  if (!route || route.via !== 'graph' || latitude == null || longitude == null) {
    return;
  }
  if (originLat == null || originLon == null) {
    return;
  }
  const name = session.destinationName;
  try {
    const alongStreets = await streetRoutes(originLat, originLon, latitude, longitude);
    const chosen = alongStreets[0];
    if (!chosen) {
      return;
    }
    const current = useSessionStore.getState();
    if (current.route?.via !== 'graph' || current.destinationName !== name) {
      return;
    }
    const finished = keepDistinctRoutes(alongStreets.map(street => ({...street, via: 'street' as const})));
    current.setAlternatives(finished);
    current.setRoute(finished[0], name, {latitude, longitude});
  } catch {
    // The graph line stays until the street router answers.
  }
}

function holdOrFollow(
  snapshot: {
    navigationActive: boolean;
    hasSpeed: boolean;
    speedMps: number;
    heading: number;
    speedSource: string;
  },
  latitude: number,
  longitude: number,
): {latitude: number; longitude: number} {
  const settings = useSettingsStore.getState();
  const session = useSessionStore.getState();
  const obd = useObdStore.getState().snapshot;
  const engineRunning = obd?.hasRpm ? obd.rpm > 250 : null;
  const decision = decidePark(
    {
      now: Date.now(),
      navigationActive: snapshot.navigationActive,
      autoLock: settings.autoLockParked,
      autoUnlockGps: settings.autoUnlockGps,
      locked: session.locked,
      manualLock: session.manualLock,
      lockLatitude: session.lockLatitude,
      lockLongitude: session.lockLongitude,
      latitude,
      longitude,
      hasSpeed: snapshot.hasSpeed,
      speedMps: snapshot.speedMps,
      speedSource: snapshot.speedSource,
      engineRunning,
    },
    parkMemory,
  );
  parkMemory = decision.memory;
  if (decision.action === 'unlock') {
    session.unlockPosition();
  }
  if (decision.action === 'lock') {
    session.lockPosition(decision.latitude, decision.longitude, snapshot.heading, false);
  }
  return {latitude: decision.latitude, longitude: decision.longitude};
}

function rememberCalibration(snapshot: {
  navigationActive: boolean;
  trust: string;
  speedSource: string;
  hasSpeed: boolean;
}): void {
  if (!snapshot.navigationActive) {
    return;
  }
  if (snapshot.trust !== 'trusted' || snapshot.speedSource !== 'obd' || !snapshot.hasSpeed) {
    return;
  }
  if (useObdStore.getState().state !== 'ready') {
    return;
  }
  const carId = 'vehicle';
  const adapterId = useObdStore.getState().devices[0]?.id ?? 'adapter';
  useSettingsStore.getState().setCalibration({carId, adapterId, at: Date.now()});
}

function rememberPoint(
  snapshot: {navigationActive: boolean; source: string; speedMps: number; timestamp: number},
  latitude: number,
  longitude: number,
): void {
  if (!snapshot.navigationActive) {
    return;
  }
  const destination = useSessionStore.getState().destinationName;
  if (destination) {
    notedTo = destination;
  }
  if (tripStartedAt === 0) {
    tripStartedAt = snapshot.timestamp;
  }
  maxSpeed = Math.max(maxSpeed, snapshot.speedMps);
  if (lastPoint) {
    const step = haversineMeters(lastPoint.latitude, lastPoint.longitude, latitude, longitude);
    if (snapshot.source === 'dr' || snapshot.source === 'blended') {
      drDistance += step;
    } else if (snapshot.source === 'gps') {
      gpsDistance += step;
    }
  }
  const point = {latitude, longitude, source: snapshot.source};
  if (!lastPoint || haversineMeters(lastPoint.latitude, lastPoint.longitude, latitude, longitude) > 8) {
    track.push(point);
    lastPoint = point;
  }
}

function flushTrip(): void {
  if (track.length < 2) {
    resetBuffer();
    return;
  }
  const endedAt = Date.now();
  const drafted = enrichTrip({
    id: `${tripStartedAt}`,
    startedAt: tripStartedAt,
    endedAt,
    distanceM: gpsDistance + drDistance,
    durationS: Math.max(1, (endedAt - tripStartedAt) / 1000),
    gpsDistanceM: gpsDistance,
    drDistanceM: drDistance,
    maxSpeedMps: maxSpeed,
    track: [...track],
  });
  const trip: TripRecord = {...drafted, toName: preferPlace(drafted.toName, notedTo)};
  const next = [trip, ...useTripStore.getState().trips];
  useTripStore.getState().setTrips(next);
  saveTrips(next).catch(() => undefined);
  resetBuffer();
}

function resetBuffer(): void {
  track.length = 0;
  tripStartedAt = 0;
  gpsDistance = 0;
  drDistance = 0;
  maxSpeed = 0;
  lastPoint = null;
  notedTo = '';
}
