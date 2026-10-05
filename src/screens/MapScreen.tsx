import {useEffect, useRef, useState} from 'react';
import {Keyboard, StyleSheet, Text, View} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';

import {BottomSheet} from '../components/BottomSheet';
import {DestinationBar} from '../components/DestinationBar';
import {HotPlaces} from '../components/HotPlaces';
import {MapControls} from '../components/MapControls';
import {NaviMap} from '../components/NaviMap';
import {ManeuverBanner} from '../components/ManeuverBanner';
import {MapCoach} from '../components/MapCoach';
import {TripPanel} from '../components/TripPanel';
import {TripReadout} from '../components/TripReadout';
import {offRoadEta, StatusIcons} from '../components/SystemStatus';
import type {Place, RoutePlan, TrustLevel} from '../models/domain';
import NativeTripSession from '../native/NativeTripSession';
import {confirmTrip, startTripTo} from '../services/navigation/startTrip';
import {saveSettings, selectPersisted} from '../services/settings/SettingsRepository';
import {nextCue, progressAlong} from '../services/navigation/maneuver';
import {speakManeuver, stopManeuverSpeech} from '../services/navigation/speakCue';
import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import {openAdapterSetup} from '../navigation/navigationRef';
import type {MainTabParamList} from '../navigation/types';
import {useMapStore} from '../store/mapStore';
import {useObdStore} from '../store/obdStore';
import {useSessionStore} from '../store/sessionStore';
import {useSettingsStore} from '../store/settingsStore';
import {haversineMeters} from '../utils/geo';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
type Props = BottomTabScreenProps<MainTabParamList, 'Map'>;

export function MapScreen(_props: Props) {
  const {colors} = useTheme();
  const snapshot = useSessionStore(state => state.snapshot);
  const latitude = useSessionStore(state => state.displayLatitude);
  const longitude = useSessionStore(state => state.displayLongitude);
  const crossTrackM = useSessionStore(state => state.crossTrackM);
  const route = useSessionStore(state => state.route);
  const routeMissing = useSessionStore(state => state.routeMissing);
  const routeNote = useSessionStore(state => state.routeNote);
  const destinationName = useSessionStore(state => state.destinationName);
  const follow = useSessionStore(state => state.follow);
  const baseZoom = useSettingsStore(state => state.baseZoom);
  const keepManualZoom = useSettingsStore(state => state.keepManualZoom);
  const gpsCheck = useSettingsStore(state => state.gpsCheck);
  const mapCoach = useSettingsStore(state => state.mapCoach);
  const coachSeen = useSettingsStore(state => state.coachSeen);
  const [coachVisible, setCoachVisible] = useState(false);
  const language = useSettingsStore(state => state.language);
  const copy = uiCopy(language);
  const alternatives = useSessionStore(state => state.alternatives);
  const locked = useSessionStore(state => state.locked);
  const manualLock = useSessionStore(state => state.manualLock);
  const voice = useSettingsStore(state => state.voice);
  const adapterState = useObdStore(state => state.state);
  const adapterReady = adapterState === 'ready';
  const online = useMapStore(state => state.online);
  const linkKnown = useMapStore(state => state.linkKnown);
  const zoomRef = useRef(baseZoom);
  const [zoomToken, setZoomToken] = useState(0);
  const [picking, setPicking] = useState(false);
  const [driving, setDriving] = useState(false);
  const [target, setTarget] = useState<Place | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const [searching, setSearching] = useState(false);
  const [coachStep, setCoachStep] = useState(0);
  const [traveledM, setTraveledM] = useState(0);
  const [headingUp, setHeadingUp] = useState(true);
  const [buildings3d, setBuildings3d] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const movedAt = useRef(0);
  const touching = useRef(false);
  const turnRate = useRef(0);
  const lastHead = useRef<{at: number; heading: number} | null>(null);
  const trust = (snapshot?.trust ?? 'lost') as TrustLevel;
  const drActive = snapshot?.source === 'dr' || snapshot?.source === 'blended';
  const centerLat = latitude ?? 50.4501;
  const centerLon = longitude ?? 30.5234;
  const farFromRoads = snapshot?.hasEstimate === true && crossTrackM != null && crossTrackM > 80;
  const eta = farFromRoads ? offRoadEta(crossTrackM, snapshot?.speedMps ?? 0, snapshot?.hasSpeed === true) : null;
  const shownLat = centerLat;
  const shownLon = centerLon;
  const shownHeading = snapshot?.heading ?? 0;
  const liveSpeed = snapshot?.hasSpeed ? snapshot.speedMps : 0;
  const speedMps = liveSpeed;
  const lastFix = useRef<{lat: number; lon: number} | null>(null);
  if (follow && !keepManualZoom && !touching.current) {
    zoomRef.current = zoomFor(baseZoom, liveSpeed, turnRate.current);
  }

  useEffect(() => {
    if (!route) {
      return;
    }
    movedAt.current = Date.now();
  }, [route]);

  useEffect(() => {
    if (!mapCoach && coachSeen) {
      return;
    }
    setCoachVisible(true);
    setCoachStep(0);
    if (coachSeen) {
      return;
    }
    const store = useSettingsStore.getState();
    store.setCoachSeen(true);
    saveSettings(selectPersisted(useSettingsStore.getState())).catch(() => undefined);
  }, [mapCoach, coachSeen]);

  useEffect(() => {
    if (latitude == null || longitude == null) {
      return;
    }
    const previous = lastFix.current;
    lastFix.current = {lat: latitude, lon: longitude};
    if (!previous) {
      return;
    }
    const step = haversineMeters(previous.lat, previous.lon, latitude, longitude);
    if (step < 4 || step > 400) {
      return;
    }
    setTraveledM(value => value + step);
  }, [latitude, longitude]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', event => {
      setKeyboard(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const zoomReady = useRef(false);
  useEffect(() => {
    zoomRef.current = baseZoom;
    if (!zoomReady.current) {
      zoomReady.current = true;
      return;
    }
    setZoomToken(token => token + 1);
  }, [baseZoom]);

  useEffect(() => {
    const heading = shownHeading;
    const now = Date.now();
    const previous = lastHead.current;
    if (previous) {
      const dt = (now - previous.at) / 1000;
      if (dt > 0.05 && dt < 1.5) {
        let delta = heading - previous.heading;
        if (delta > 180) {
          delta -= 360;
        }
        if (delta < -180) {
          delta += 360;
        }
        turnRate.current = delta / dt;
      }
    }
    lastHead.current = {at: now, heading};
  }, [shownHeading]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (touching.current || useSessionStore.getState().follow) {
        return;
      }
      const settings = useSettingsStore.getState();
      if (useSessionStore.getState().route && !driving) {
        return;
      }
      if (Date.now() - movedAt.current < settings.autoReturnSeconds * 1000) {
        return;
      }
      if (!settings.keepManualZoom) {
        const speed = useSessionStore.getState().snapshot?.speedMps ?? 0;
        zoomRef.current = zoomFor(settings.baseZoom, speed, turnRate.current);
        setZoomToken(token => token + 1);
      }
      useSessionStore.getState().setFollow(true);
    }, 200);
    return () => clearInterval(timer);
  }, [driving]);

  const routeKey = route ? `${route.distanceM}:${route.coordinates.length}` : '';
  const previewKey = route ? `${route.distanceM}:${route.durationS}:${route.coordinates.length}` : '';
  useEffect(() => {
    setDriving(false);
    setBuildings3d(false);
  }, [routeKey]);

  const previewRoute = (place: Place) => {
    setTarget(place);
    setPicking(false);
    setDriving(false);
    movedAt.current = Date.now();
    useSessionStore.getState().setFollow(false);
    startTripTo(place, {latitude: shownLat, longitude: shownLon})
      .then(result => {
        if (result === 'ok') {
          setFitToken(token => token + 1);
        }
      })
      .catch(() => undefined);
  };

  const depart = () => {
    confirmTrip().catch(() => undefined);
    setHeadingUp(true);
    zoomRef.current = zoomFor(useSettingsStore.getState().baseZoom, useSessionStore.getState().snapshot?.speedMps ?? 0, turnRate.current);
    setZoomToken(token => token + 1);
    movedAt.current = Date.now();
    useSessionStore.getState().setFollow(true);
    setDriving(true);
  };

  const cancelTrip = () => {
    setDriving(false);
    setBuildings3d(false);
    setTarget(null);
    setPicking(false);
    useSessionStore.getState().resetRoute();
    NativeTripSession?.stopNavigation();
  };

  const alongM = route ? progressAlong(route.coordinates, shownLat, shownLon) : 0;
  const remainingM = route ? Math.max(0, route.distanceM - alongM) : traveledM;
  const remainingS = route && route.distanceM > 0 ? route.durationS * (remainingM / route.distanceM) : 0;
  const cue = driving && route ? nextCue(route, shownLat, shownLon, resolveLanguage(language)) : null;
  const spoken = cue ? `${cue.title}:${Math.round(cue.meters / 20)}` : '';
  useEffect(() => {
    if (!voice) {
      stopManeuverSpeech();
    }
  }, [voice]);
  useEffect(() => {
    if (!driving || !cue || !voice) {
      return;
    }
    speakManeuver(cue.meters, cue.title, resolveLanguage(language), cue.turn === 'arrive');
  }, [spoken, driving, cue, language, voice]);

  return (
    <View style={[styles.fill, {backgroundColor: colors.background}]}>
      <NaviMap
        latitude={shownLat}
        longitude={shownLon}
        heading={shownHeading}
        speedMps={speedMps}
        follow={follow}
        tracking={driving}
        headingUp={headingUp}
        buildings3d={driving && buildings3d}
        fitToken={fitToken}
        gpsAccuracy={trust === 'untrusted' || trust === 'lost' ? null : snapshot?.gpsAccuracy ?? null}
        uncertainty={drActive ? snapshot?.accuracy ?? null : null}
        showUncertainty={drActive}
        route={route}
        alternatives={alternatives}
        onAlternative={picked => chooseRoute(picked, driving)}
        zoomRef={zoomRef}
        zoomToken={zoomToken}
        destination={target}
        destinationPin={target?.kind === 'pin'}
        onMapPress={
          picking
            ? (pressLongitude, pressLatitude) => {
                previewRoute({
                  id: `pin-${pressLongitude.toFixed(5)}-${pressLatitude.toFixed(5)}`,
                  name: copy.mapPoint,
                  latitude: pressLatitude,
                  longitude: pressLongitude,
                  kind: 'pin',
                });
              }
            : undefined
        }
        onGesture={(holding, zoom) => {
          touching.current = holding;
          if (holding) {
            zoomRef.current = zoom;
          }
        }}
        onUserMove={zoom => {
          touching.current = false;
          zoomRef.current = zoom;
          movedAt.current = Date.now();
          useSessionStore.getState().setFollow(false);
        }}
      />
      {farFromRoads ? (
        <View style={styles.banners}>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {copy.noRoad}
              {eta ? ` · ${eta}` : ''}
            </Text>
          </View>
        </View>
      ) : null}
      {routeMissing ? (
        <View pointerEvents="none" style={styles.routeMissing}>
          <View style={styles.routeMissingCard}>
            <Text style={styles.routeMissingTitle}>{copy.routeMissing}</Text>
            {routeNote && routeNote !== copy.routeMissing && !routeNote.startsWith(copy.routeMissing) ? (
              <Text style={styles.routeMissingNote}>{routeNote}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {cue ? <ManeuverBanner meters={cue.meters} title={cue.title} turn={cue.turn} /> : null}
      <StatusIcons
        adapterState={adapterState}
        online={online}
        linkKnown={linkKnown}
        snapshot={snapshot}
        gpsCheck={gpsCheck}
        onSetup={() => openAdapterSetup()}
      />
      {linkKnown && !online ? (
        <View pointerEvents="none" style={styles.linkBanner}>
          <Text style={styles.linkTitle}>{copy.offline}</Text>
          <Text style={styles.linkBody}>{adapterReady ? copy.offlineObd : copy.offlinePhone}</Text>
        </View>
      ) : null}
      <HotPlaces />
      <MapControls
        follow={follow}
        locked={manualLock}
        road={route != null}
        driving={driving}
        buildings3d={buildings3d}
        headingUp={headingUp}
        onBuildings={() => {
          const next = !buildings3d;
          if (next && zoomRef.current < 15.5) {
            zoomRef.current = 16.2;
            setZoomToken(token => token + 1);
          }
          setBuildings3d(next);
        }}
        onOverview={() => {
          useSessionStore.getState().setFollow(false);
          setFitToken(token => token + 1);
        }}
        onHeading={() => {
          setHeadingUp(true);
          movedAt.current = Date.now();
          useSessionStore.getState().setFollow(true);
        }}
        onNorth={() => setHeadingUp(false)}
        onLock={() => {
          const session = useSessionStore.getState();
          if (session.manualLock) {
            session.unlockPosition();
            return;
          }
          session.lockPosition(
            session.displayLatitude ?? shownLat,
            session.displayLongitude ?? shownLon,
            session.snapshot?.heading ?? shownHeading,
            true,
          );
        }}
        onFollow={() => {
          const settings = useSettingsStore.getState();
          if (!settings.keepManualZoom) {
            const speed = snapshot?.speedMps ?? 0;
            zoomRef.current = zoomFor(settings.baseZoom, speed, turnRate.current);
            setZoomToken(token => token + 1);
          }
          movedAt.current = Date.now();
          useSessionStore.getState().setFollow(true);
        }}
        onZoomIn={() => {
          zoomRef.current = Math.min(18, zoomRef.current + 1);
          movedAt.current = Date.now();
          setZoomToken(token => token + 1);
        }}
        onZoomOut={() => {
          zoomRef.current = Math.max(12, zoomRef.current - 1);
          movedAt.current = Date.now();
          setZoomToken(token => token + 1);
        }}
      />
      {route ? null : <TripReadout speedMps={speedMps} />}
      {coachVisible ? (
        <MapCoach
          language={language}
          step={coachStep}
          onStep={setCoachStep}
          onClose={() => {
            const store = useSettingsStore.getState();
            store.setCoachSeen(true);
            store.setMapCoach(false);
            setCoachVisible(false);
            saveSettings(selectPersisted(useSettingsStore.getState())).catch(() => undefined);
          }}
        />
      ) : null}
      {picking ? (
        <View style={styles.pickHint}>
          <Text style={styles.pickHintText}>{copy.tapMap}</Text>
        </View>
      ) : null}
      {route && driving ? (
        <TripPanel
          mode="drive"
          meters={remainingM}
          seconds={remainingS}
          others={alternatives}
          onPick={picked => chooseRoute(picked, true)}
          onEnd={cancelTrip}
        />
      ) : (
        <BottomSheet aboveTabs light lift={searching ? 0 : keyboard}>
          {locked ? <Text style={styles.lockNote}>{copy.parked}</Text> : null}
          {route ? (
            <TripPanel
              key={previewKey}
              mode="preview"
              meters={route.distanceM}
              seconds={route.durationS}
              place={destinationName ?? target?.name ?? copy.mapPoint}
              roads={roadSummary(route, copy.streets)}
              best={route.durationS <= fastestSeconds(route, alternatives)}
              onGo={depart}
              onCancel={cancelTrip}
            />
          ) : (
            <DestinationBar
              navigating={false}
              picking={picking}
              target={target}
              onPickToggle={() => setPicking(value => !value)}
              onTarget={place => previewRoute(place)}
              onGo={() => {
                if (!target) {
                  return;
                }
                Keyboard.dismiss();
                previewRoute(target);
              }}
              onStop={cancelTrip}
              onFocus={() => setSearching(true)}
              onSearchClose={() => setSearching(false)}
            />
          )}
        </BottomSheet>
      )}
    </View>
  );
}

function zoomFor(base: number, speedMps: number, turnDegPerSec: number): number {
  const wider = Math.min(3, (Math.max(0, speedMps) * 3.6) / 30);
  const turn = Math.min(1.5, Math.abs(turnDegPerSec) / 30);
  return Math.min(18, Math.max(12, base - wider + turn));
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  linkBanner: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 78,
    zIndex: 6,
    backgroundColor: '#1C1430',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
  },
  linkTitle: {...type.bodyStrong, color: '#FFFFFF'},
  linkBody: {...type.caption, color: '#F3F0FA'},
  banners: {position: 'absolute', left: 12, right: 72, top: 118, gap: 8},
  banner: {
    alignSelf: 'flex-start',
    backgroundColor: '#FBFAFE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: {...type.caption, color: '#1C1430', fontWeight: '700'},
  routeMissing: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: '36%',
    alignItems: 'center',
  },
  routeMissingCard: {
    backgroundColor: '#F8EBD4',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 6,
    maxWidth: 320,
  },
  routeMissingTitle: {...type.bodyStrong, color: '#1C1430', textAlign: 'center'},
  routeMissingNote: {...type.caption, color: '#1C1430', textAlign: 'center'},
  lockNote: {...type.caption, color: '#655C78'},
  pickHint: {
    position: 'absolute',
    top: 116,
    alignSelf: 'center',
    backgroundColor: '#1C1430',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pickHintText: {color: '#FFFFFF', fontWeight: '700', fontSize: 13},
});

function roadSummary(route: RoutePlan, generic: string): string {
  const names: string[] = [];
  for (const step of route.steps) {
    const name = step.name.trim();
    if (!name || name === generic || names[names.length - 1] === name) {
      continue;
    }
    names.push(name);
    if (names.length === 3) {
      break;
    }
  }
  return names.join(', ');
}

function fastestSeconds(route: RoutePlan, alternatives: RoutePlan[]): number {
  return alternatives.reduce((min, item) => Math.min(min, item.durationS), route.durationS);
}

function chooseRoute(next: RoutePlan, keepFollow: boolean): void {
  const session = useSessionStore.getState();
  const previous = session.route;
  const rest = session.alternatives.filter(item => !samePlan(item, next));
  if (previous && !samePlan(previous, next)) {
    rest.unshift(previous);
  }
  session.setAlternatives(rest);
  if (!keepFollow) {
    session.setFollow(false);
  }
  const end = next.coordinates[next.coordinates.length - 1];
  session.setRoute(next, session.destinationName ?? '', {
    latitude: session.destinationLatitude ?? end?.[1] ?? 0,
    longitude: session.destinationLongitude ?? end?.[0] ?? 0,
  });
}

function samePlan(left: RoutePlan, right: RoutePlan): boolean {
  return left.distanceM === right.distanceM && left.coordinates.length === right.coordinates.length;
}
