import {useEffect, useRef, useState} from 'react';
import {Keyboard, StyleSheet, Text, View} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';

import {AlongSheet} from '../components/AlongSheet';
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
import {nextCues, progressAlong} from '../services/navigation/maneuver';
import {speakManeuver, stopManeuverSpeech} from '../services/navigation/speakCue';
import {speedLimitKmh} from '../services/navigation/speedLimit';
import {isNightAt} from '../services/maps/sun';
import {clearOpenNav, loadOpenNav, saveOpenNav} from '../services/navigation/openNav';
import {saveOpenTrip} from '../hooks/useAppServices';
import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import {openAdapterSetup} from '../navigation/navigationRef';
import type {MainTabParamList} from '../navigation/types';
import {useLinkStore} from '../store/linkStore';
import {useMapStore} from '../store/mapStore';
import {useSearchHistoryStore} from '../store/searchHistoryStore';
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
  const roadName = useSessionStore(state => state.roadName);
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
  const hudWake = useSessionStore(state => state.hudWake);
  const stops = useSessionStore(state => state.stops);
  const [alongOpen, setAlongOpen] = useState(false);
  const incomingToken = useLinkStore(state => state.token);
  const movedAt = useRef(0);
  const touching = useRef(false);
  const turnRate = useRef(0);
  const lastHead = useRef<{at: number; heading: number} | null>(null);
  const nightHold = useRef(false);
  const trust = (snapshot?.trust ?? 'lost') as TrustLevel;
  const drActive = snapshot?.source === 'dr' || snapshot?.source === 'blended';
  const located = latitude != null && longitude != null;
  const centerLat = latitude ?? 0;
  const centerLon = longitude ?? 0;
  const farFromRoads = snapshot?.hasEstimate === true && crossTrackM != null && crossTrackM > 80;
  const eta = farFromRoads ? offRoadEta(crossTrackM, snapshot?.speedMps ?? 0, snapshot?.hasSpeed === true) : null;
  const shownLat = centerLat;
  const shownLon = centerLon;
  const shownHeading = snapshot?.heading ?? 0;
  const liveSpeed = snapshot?.hasSpeed ? snapshot.speedMps : 0;
  const speedMps = liveSpeed;
  const [offlineNote, setOfflineNote] = useState(false);
  const offlineOnce = useRef(false);
  const arriveHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFix = useRef<{lat: number; lon: number} | null>(null);
  if (located && follow && !keepManualZoom && !touching.current) {
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

  useEffect(() => {
    if (!located) {
      return;
    }
    zoomRef.current = baseZoom;
    setZoomToken(token => token + 1);
  }, [baseZoom, located]);

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
    if (route) {
      return;
    }
    setDriving(false);
    setBuildings3d(false);
  }, [routeKey]);

  const previewRoute = (place: Place) => {
    setTarget(place);
    setPicking(false);
    setDriving(false);
    movedAt.current = Date.now();
    useSearchHistoryStore.getState().remember(place);
    useSessionStore.getState().setStops([]);
    useSessionStore.getState().resetRoute();
    useSessionStore.getState().setFollow(false);
    startTripTo(place)
      .then(result => {
        if (result === 'ok') {
          setFitToken(token => token + 1);
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    const place = useLinkStore.getState().pending;
    if (!place) {
      return;
    }
    useLinkStore.getState().clear();
    previewRoute(place);
  }, [incomingToken]);

  useEffect(() => {
    let alive = true;
    loadOpenNav()
      .then(nav => {
        if (!alive || !nav || useSessionStore.getState().route) {
          return;
        }
        useSessionStore.getState().setStops(nav.stops);
        setTarget(nav.destination);
        startTripTo(nav.destination)
          .then(result => {
            if (!alive || result !== 'ok') {
              return;
            }
            confirmTrip().catch(() => undefined);
            setHeadingUp(true);
            useSessionStore.getState().setFollow(true);
            setDriving(true);
            useSessionStore.getState().setDriving(true);
            useSessionStore.getState().bumpHud();
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const addStop = (place: Place) => {
    const dest = destinationPlace(target, destinationName);
    if (!dest) {
      return;
    }
    const stops = [...useSessionStore.getState().stops, place];
    useSessionStore.getState().setStops(stops);
    startTripTo(dest)
      .then(result => {
        if (result === 'ok') {
          saveOpenNav({destination: dest, stops}).catch(() => undefined);
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
    useSessionStore.getState().setDriving(true);
    useSessionStore.getState().bumpHud();
    const dest = destinationPlace(target, destinationName);
    if (dest) {
      saveOpenNav({destination: dest, stops: useSessionStore.getState().stops}).catch(() => undefined);
    }
  };

  const cancelTrip = () => {
    if (arriveHold.current) {
      clearTimeout(arriveHold.current);
      arriveHold.current = null;
    }
    saveOpenTrip();
    stopManeuverSpeech();
    setDriving(false);
    useSessionStore.getState().setDriving(false);
    setAlongOpen(false);
    setBuildings3d(false);
    setTarget(null);
    setPicking(false);
    useSessionStore.getState().resetRoute();
    clearOpenNav().catch(() => undefined);
    NativeTripSession?.stopNavigation();
  };

  const alongM = route && located ? progressAlong(route.coordinates, shownLat, shownLon) : 0;
  const remainingM = route ? Math.max(0, route.distanceM - alongM) : traveledM;
  const remainingS = route && route.distanceM > 0 ? route.durationS * (remainingM / route.distanceM) : 0;
  const pair = driving && route && located ? nextCues(route, shownLat, shownLon, resolveLanguage(language)) : null;
  const cue = pair?.current ?? null;
  const spoken = cue ? `${cue.title}:${Math.round(cue.meters / 20)}` : '';
  const limitKmh = driving && located ? speedLimitKmh(shownLat, shownLon, route) : null;
  const nightLive = driving && located && isNightAt(shownLat, shownLon);
  if (!alongOpen) {
    nightHold.current = nightLive;
  }
  const nightMap = nightHold.current;
  const nearDest = Boolean(driving && remainingM > 80 && remainingM <= 900);
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

  useEffect(() => {
    if (!linkKnown) {
      return;
    }
    if (online) {
      offlineOnce.current = false;
      setOfflineNote(false);
      return;
    }
    if (offlineOnce.current) {
      return;
    }
    offlineOnce.current = true;
    setOfflineNote(true);
    const timer = setTimeout(() => setOfflineNote(false), 4200);
    return () => clearTimeout(timer);
  }, [linkKnown, online]);

  useEffect(() => {
    const near = Boolean(driving && route && located && remainingM <= 48);
    const lost = !driving || !route || !located || remainingM > 90;
    if (lost) {
      if (arriveHold.current) {
        clearTimeout(arriveHold.current);
        arriveHold.current = null;
      }
      return;
    }
    if (!near || arriveHold.current) {
      return;
    }
    arriveHold.current = setTimeout(() => {
      arriveHold.current = null;
      saveOpenTrip();
      stopManeuverSpeech();
      setDriving(false);
      useSessionStore.getState().setDriving(false);
      setBuildings3d(false);
      setTarget(null);
      setPicking(false);
      useSessionStore.getState().resetRoute();
      clearOpenNav().catch(() => undefined);
      NativeTripSession?.stopNavigation();
    }, 900);
  }, [driving, located, remainingM, route]);

  useEffect(() => {
    return () => {
      if (arriveHold.current) {
        clearTimeout(arriveHold.current);
        arriveHold.current = null;
      }
    };
  }, []);

  return (
    <View
      style={[styles.fill, {backgroundColor: colors.background}]}
      onTouchStart={() => {
        if (driving) {
          useSessionStore.getState().bumpHud();
        }
      }}>
      {located ? null : (
        <View style={styles.locating} pointerEvents="none">
          <Text style={[type.body, {color: colors.textSecondary}]}>{copy.locating}</Text>
        </View>
      )}
      {located ? (
      <NaviMap
        latitude={shownLat}
        longitude={shownLon}
        heading={shownHeading}
        speedMps={speedMps}
        follow={follow && located}
        located={located}
        tracking={driving}
        nightMap={nightMap}
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
        stops={stops}
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
        onPlaceGo={place => {
          previewRoute({
            id: place.id,
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            kind: place.kind,
          });
        }}
        onGesture={(holding, zoom) => {
          touching.current = holding;
          if (holding) {
            zoomRef.current = zoom;
            useSessionStore.getState().setFollow(false);
            if (driving) {
              useSessionStore.getState().bumpHud();
            }
          }
        }}
        onUserMove={zoom => {
          touching.current = false;
          zoomRef.current = zoom;
          movedAt.current = Date.now();
          useSessionStore.getState().setFollow(false);
        }}
      />
      ) : null}
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
      {cue ? (
        <ManeuverBanner
          current={cue}
          after={pair?.after}
          thenWord={copy.thenCue}
          street={roadName || cue.street}
        />
      ) : null}
      <StatusIcons
        adapterState={adapterState}
        online={online}
        linkKnown={linkKnown}
        snapshot={snapshot}
        gpsCheck={gpsCheck}
        onSetup={() => openAdapterSetup()}
      />
      {offlineNote ? (
        <View pointerEvents="none" style={styles.linkBanner}>
          <Text style={styles.linkTitle}>{copy.offline}</Text>
          <Text style={styles.linkBody}>{adapterReady ? copy.offlineObd : copy.offlinePhone}</Text>
        </View>
      ) : null}
      {driving ? null : <HotPlaces />}
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
          if (session.displayLatitude == null || session.displayLongitude == null) {
            return;
          }
          session.lockPosition(
            session.displayLatitude,
            session.displayLongitude,
            session.snapshot?.heading ?? shownHeading,
            true,
          );
        }}
        onAlong={() => setAlongOpen(true)}
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
      {driving ? <TripReadout speedMps={speedMps} limitKmh={limitKmh} /> : null}
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
          place={destinationName ?? target?.name ?? ''}
          others={alternatives}
          wake={hudWake}
          parkingNear={nearDest}
          onAlong={() => setAlongOpen(true)}
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
      {route && driving && located ? (
        <AlongSheet
          open={alongOpen}
          route={route}
          here={{latitude: shownLat, longitude: shownLon}}
          nearDest={nearDest}
          onClose={() => setAlongOpen(false)}
          onChoose={place => {
            setAlongOpen(false);
            addStop(place);
          }}
        />
      ) : null}
    </View>
  );
}

function destinationPlace(target: Place | null, name: string | null): Place | null {
  const session = useSessionStore.getState();
  const latitude = target?.latitude ?? session.destinationLatitude;
  const longitude = target?.longitude ?? session.destinationLongitude;
  if (latitude == null || longitude == null) {
    return null;
  }
  return {
    id: target?.id ?? `dest-${longitude.toFixed(5)}-${latitude.toFixed(5)}`,
    name: target?.name ?? name ?? '',
    latitude,
    longitude,
    kind: target?.kind ?? 'place',
    detail: target?.detail,
  };
}

function zoomFor(base: number, speedMps: number, turnDegPerSec: number): number {
  const wider = Math.min(3, (Math.max(0, speedMps) * 3.6) / 30);
  const turn = Math.min(1.5, Math.abs(turnDegPerSec) / 30);
  return Math.min(18, Math.max(12, base - wider + turn));
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  locating: {position: 'absolute', top: '42%', left: 24, right: 24, alignItems: 'center'},
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
