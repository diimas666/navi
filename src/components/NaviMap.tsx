import {useEffect, useMemo, useRef, useState, type MutableRefObject} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

import {GOOGLE_MAPS_KEY} from '../constants/googleMapsKey';
import {DARK_STYLE_URL, VECTOR_STYLE_URL} from '../constants/map';
import {GoogleRoadMap, googleWebViewReady} from './GoogleRoadMap';
import {loadBasemapStyle} from '../services/maps/basemapStyle';
import {cityDistrictLabels, districtLabels} from '../services/maps/districts';
import {
  fetchNearbyPlaces,
  fetchPlaceHours,
  nearbyColors,
  nearbyMarks,
  nearbyRadius,
  type NearbyPlace,
  type PlaceHours,
} from '../services/maps/nearbyPlaces';
import {formatDistance} from '../utils/format';
import {haversineMeters} from '../utils/geo';
import {resolveLanguage} from '../i18n/settingsCopy';
import {housesNear} from '../services/maps/houses';
import {useMapStore} from '../store/mapStore';
import {accuracyFeature} from './AccuracyCircle';
import {uncertaintyFeature} from './UncertaintyCircle';
import {VehicleMarker} from './VehicleMarker';
import type {RoutePlan} from '../models/domain';
import {uiCopy} from '../i18n/uiCopy';
import {driveBearing, driveFocal, drivePadding, glideDuration} from '../services/maps/cameraPull';
import {distanceToRoute} from '../services/navigation/offRoute';
import {remainingCoordinates} from '../services/navigation/maneuver';
import {routingGraph} from '../services/roads/RegionGraph';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

const LOCAL_HIGHWAYS = new Set([
  'residential',
  'living_street',
  'service',
  'unclassified',
  'tertiary',
  'tertiary_link',
]);

function chooseMapStyle(
  _offline: boolean,
  basemap: StyleSpecification | null,
  mode: 'light' | 'dark',
): string | StyleSpecification {
  if (basemap) {
    return basemap;
  }
  return mode === 'dark' ? DARK_STYLE_URL : VECTOR_STYLE_URL;
}

function settleCamera(pending: unknown) {
  if (pending instanceof Promise) {
    pending.catch(() => undefined);
  }
}

type Props = {
  latitude: number;
  longitude: number;
  heading: number;
  follow: boolean;
  gpsAccuracy: number | null;
  uncertainty: number | null;
  showUncertainty: boolean;
  route: RoutePlan | null;
  alternatives?: RoutePlan[];
  onAlternative?: (route: RoutePlan) => void;
  zoomRef: MutableRefObject<number>;
  zoomToken: number;
  onUserMove?: (zoom: number) => void;
  onGesture?: (holding: boolean, zoom: number) => void;
  onMapPress?: (longitude: number, latitude: number) => void;
  onPlaceGo?: (place: NearbyPlace) => void;
  destination?: {longitude: number; latitude: number; name?: string} | null;
  destinationPin?: boolean;
  tracking?: boolean;
  headingUp?: boolean;
  fitToken?: number;
  buildings3d?: boolean;
  speedMps?: number;
  located?: boolean;
};

export function NaviMap({
  latitude,
  longitude,
  heading,
  follow,
  gpsAccuracy,
  uncertainty,
  showUncertainty,
  route,
  alternatives = [],
  onAlternative,
  zoomRef,
  zoomToken,
  onUserMove,
  onGesture,
  onMapPress,
  onPlaceGo,
  destination,
  destinationPin,
  tracking,
  headingUp = true,
  fitToken = 0,
  buildings3d = false,
  speedMps = 0,
  located = true,
}: Props) {
  const {colors, mode} = useTheme();
  const language = useSettingsStore(state => state.language);
  const placeIcons = useSettingsStore(state => state.placeIcons);
  const copy = uiCopy(language);
  const cameraRef = useRef<CameraRef>(null);
  const lastCameraMove = useRef(0);
  const lastPitch = useRef(0);
  const pitchArmed = useRef(false);
  const lastPinned = useRef(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const [frameWidth, setFrameWidth] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const pitched = Boolean(buildings3d && tracking);
  const streetLabels = mode === 'dark' ? 'highway_name_other' : 'highway-name-path';
  const pinned = Boolean(tracking && follow && headingUp);
  const frame = frameHeight || 780;
  const course = pinned
    ? driveBearing(route?.coordinates, latitude, longitude, heading, speedMps)
    : tracking && headingUp
      ? heading
      : 0;
  const pitch = pitched ? 58 : 0;
  const [basemap, setBasemap] = useState<StyleSpecification | null>(null);
  const [view, setView] = useState({latitude, longitude, zoom: zoomRef.current});
  const online = useMapStore(state => state.online);
  const linkKnown = useMapStore(state => state.linkKnown);
  const offlineMap = linkKnown && !online;
  const [googleLive, setGoogleLive] = useState(false);
  const [look, setLook] = useState({latitude, longitude, zoom: zoomRef.current});
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [picked, setPicked] = useState<NearbyPlace | null>(null);
  const [hours, setHours] = useState<PlaceHours | null>(null);
  const useGoogle =
    GOOGLE_MAPS_KEY.length > 20 &&
    googleWebViewReady() &&
    (googleLive || !offlineMap);
  const styleKind = `${mode}:${basemap ? 'styled' : 'url'}`;
  const seenStyle = useRef(styleKind);
  const styleGeneration = useRef(0);
  if (seenStyle.current !== styleKind) {
    seenStyle.current = styleKind;
    styleGeneration.current += 1;
    if (mapReady) {
      setMapReady(false);
    }
  }
  const styleGenerationNow = styleGeneration.current;
  useEffect(() => {
    if (!follow) {
      return;
    }
    setLook({latitude, longitude, zoom: zoomRef.current});
  }, [follow, latitude, longitude, zoomToken]);

  useEffect(() => {
    if (!placeIcons || nearbyRadius(look.zoom) === 0 || offlineMap || GOOGLE_MAPS_KEY.length < 20) {
      setNearby([]);
      setPicked(null);
      return;
    }
    let gone = false;
    const timer = setTimeout(() => {
      fetchNearbyPlaces(look.latitude, look.longitude, look.zoom, resolveLanguage(language))
        .then(places => {
          if (!gone) {
            setNearby(places);
          }
        })
        .catch(() => {
          if (!gone) {
            setNearby([]);
          }
        });
    }, 280);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [look.latitude, look.longitude, look.zoom, language, offlineMap, placeIcons]);

  useEffect(() => {
    if (!picked) {
      setHours(null);
      return;
    }
    let gone = false;
    fetchPlaceHours(picked.id, resolveLanguage(language))
      .then(value => {
        if (!gone) {
          setHours(value);
        }
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [language, picked]);

  const choosePlace = (place: NearbyPlace) => {
    setPicked(place);
  };

  const cityMarks = useMemo(() => cityDistrictLabels(), []);
  const hoodMarks = useMemo(() => districtLabels(), []);
  const areaZoom = look.zoom;
  const showAreaNames = !tracking && !pitched && Math.abs(course) < 15;
  const visibleCityDistricts = useMemo(() => {
    if (!showAreaNames || areaZoom < 8.8 || areaZoom > 15.8) {
      return [];
    }
    return cityMarks.filter(
      item => haversineMeters(look.latitude, look.longitude, item.lat, item.lon) < 32000,
    );
  }, [areaZoom, cityMarks, look.latitude, look.longitude, showAreaNames]);
  const visibleHoods = useMemo(() => {
    if (!showAreaNames || areaZoom < 12.3 || areaZoom > 16.9) {
      return [];
    }
    return hoodMarks
      .map(item => ({
        ...item,
        away: haversineMeters(look.latitude, look.longitude, item.lat, item.lon),
      }))
      .filter(item => item.away < 9000)
      .sort((left, right) => left.away - right.away)
      .slice(0, 28);
  }, [areaZoom, hoodMarks, look.latitude, look.longitude, showAreaNames]);
  const streetKey = `${view.latitude.toFixed(3)}:${view.longitude.toFixed(3)}`;
  const localStreets = useMemo(() => {
    const [latText, lonText] = streetKey.split(':');
    const lat = Number(latText);
    const lon = Number(lonText);
    const edges = routingGraph()
      .edgesNear(lat, lon)
      .filter(edge => LOCAL_HIGHWAYS.has(edge.highway))
      .slice(0, 1500);
    return {
      type: 'FeatureCollection' as const,
      features: edges.map(edge => ({
        type: 'Feature' as const,
        properties: {name: edge.name},
        geometry: {type: 'LineString' as const, coordinates: edge.coordinates},
      })),
    };
  }, [streetKey]);
  const houseMarks = useMemo(() => {
    const [latText, lonText] = streetKey.split(':');
    const lat = Number(latText);
    const lon = Number(lonText);
    const ranked = housesNear(lat, lon)
      .map(house => ({
        house,
        offset: Math.abs(house.latitude - lat) + Math.abs(house.longitude - lon),
      }))
      .sort((left, right) => left.offset - right.offset)
      .slice(0, 500);
    return {
      type: 'FeatureCollection' as const,
      features: ranked.map(({house}, index) => ({
        type: 'Feature' as const,
        properties: {house: house.house, id: index},
        geometry: {type: 'Point' as const, coordinates: [house.longitude, house.latitude]},
      })),
    };
  }, [streetKey]);
  const otherRoutes = useMemo(() => {
    if (!route) {
      return [];
    }
    return alternatives.filter(item => !sameRoute(item, route));
  }, [alternatives, route]);
  const otherShape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: otherRoutes.map((item, index) => ({
        type: 'Feature' as const,
        properties: {id: index},
        geometry: {type: 'LineString' as const, coordinates: item.coordinates},
      })),
    }),
    [otherRoutes],
  );
  const routeNames = useMemo(() => {
    const features = (route?.steps ?? [])
      .filter(step => step.coordinates && step.coordinates.length > 1 && step.name.trim().length > 2)
      .filter(step => !/^(вулицями|по улицам)$/i.test(step.name.trim()))
      .map(step => ({
        type: 'Feature' as const,
        properties: {name: step.name},
        geometry: {type: 'LineString' as const, coordinates: step.coordinates ?? []},
      }));
    return {type: 'FeatureCollection' as const, features};
  }, [route]);
  const liveCoordinates =
    tracking && route && route.coordinates.length > 1
      ? remainingCoordinates(route.coordinates, latitude, longitude)
      : route?.coordinates;
  const routeShape = useMemo(
    () =>
      liveCoordinates && liveCoordinates.length > 1
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: {type: 'LineString' as const, coordinates: liveCoordinates},
          }
        : null,
    [liveCoordinates],
  );

  useEffect(() => {
    let live = true;
    loadBasemapStyle(mode).then(style => {
      if (live && style) {
        setBasemap(style);
      }
    });
    return () => {
      live = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!mapReady || zoomToken === 0) {
      return;
    }
    try {
      settleCamera(cameraRef.current?.zoomTo(zoomRef.current, {duration: 200}));
    } catch {
      // The native camera view can still be mounting.
    }
  }, [mapReady, zoomRef, zoomToken]);

  useEffect(() => {
    if (!mapReady || tracking || !route || route.coordinates.length < 2) {
      return;
    }
    let west = 180;
    let south = 90;
    let east = -180;
    let north = -90;
    route.coordinates.forEach(([pointLon, pointLat]) => {
      west = Math.min(west, pointLon);
      south = Math.min(south, pointLat);
      east = Math.max(east, pointLon);
      north = Math.max(north, pointLat);
    });
    try {
      settleCamera(
        cameraRef.current?.fitBounds([west, south, east, north], {
          padding: {top: 120, right: 48, bottom: 280, left: 48},
          duration: 700,
          pitch: 0,
        }),
      );
    } catch {
      // The native camera view can still be mounting.
    }
  }, [fitToken, mapReady, route, tracking]);

  useEffect(() => {
    if (!mapReady || !follow) {
      return;
    }
    const now = Date.now();
    const elapsed = lastCameraMove.current === 0 ? 480 : now - lastCameraMove.current;
    const pitchChanged = lastPitch.current !== pitch;
    const pinChanged = lastPinned.current !== pinned;
    lastPitch.current = pitch;
    lastPinned.current = pinned;
    if (!pitchChanged && !pinChanged && elapsed < (pinned ? 70 : tracking ? 120 : 280)) {
      return;
    }
    lastCameraMove.current = now;
    try {
      settleCamera(
        cameraRef.current?.easeTo({
          center: [longitude, latitude],
          bearing: course,
          zoom: zoomRef.current,
          pitch,
          padding: pinned ? drivePadding(frame) : {top: 0, right: 0, bottom: 0, left: 0},
          duration: pitchChanged ? 480 : pinned ? glideDuration(elapsed) : tracking ? 280 : 700,
          easing: pinned ? 'linear' : 'ease',
        }),
      );
    } catch {
      // The native camera view can still be mounting.
    }
  }, [course, follow, frame, latitude, longitude, mapReady, pinned, pitch, tracking, zoomRef]);

  useEffect(() => {
    if (!pitchArmed.current) {
      pitchArmed.current = true;
      return;
    }
    if (!mapReady || follow) {
      return;
    }
    try {
      settleCamera(
        cameraRef.current?.easeTo({
          center: [view.longitude, view.latitude],
          zoom: view.zoom,
          bearing: course,
          pitch,
          duration: 480,
          easing: 'ease',
        }),
      );
    } catch {
      // The native camera view can still be mounting.
    }
  }, [mapReady, pitch]);

  return (
    <View
      style={styles.fill}
      onLayout={event => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setFrameHeight(current => (current === nextHeight ? current : nextHeight));
        setFrameWidth(current => (current === nextWidth ? current : nextWidth));
      }}>
      <Map
        style={styles.fill}
        mapStyle={chooseMapStyle(linkKnown && !online, basemap, mode)}
        compass={false}
        onDidFinishLoadingMap={() => {
          if (styleGeneration.current === styleGenerationNow) {
            setMapReady(true);
          }
        }}
        onDidFinishLoadingStyle={() => {
          if (styleGeneration.current === styleGenerationNow) {
            setMapReady(true);
          }
        }}
        attribution={false}
        logo={false}
        touchPitch={false}
        onPress={event => {
          const [pressLongitude, pressLatitude] = event.nativeEvent.lngLat;
          const hit = nearestPlace(nearby, pressLatitude, pressLongitude, look.zoom);
          if (hit) {
            choosePlace(hit);
            return;
          }
          setPicked(null);
          onMapPress?.(pressLongitude, pressLatitude);
        }}
        onRegionWillChange={event => {
          if (!event.nativeEvent.userInteraction) {
            return;
          }
          onGesture?.(true, event.nativeEvent.zoom);
        }}
        onRegionIsChanging={event => {
          if (!event.nativeEvent.userInteraction) {
            return;
          }
          onGesture?.(true, event.nativeEvent.zoom);
        }}
        onRegionDidChange={event => {
          const native = event.nativeEvent as {
            zoom: number;
            userInteraction?: boolean;
            visibleBounds?: Array<[number, number]>;
          };
          const bounds = native.visibleBounds;
          const lon = bounds && bounds.length >= 2 ? (bounds[0][0] + bounds[1][0]) / 2 : view.longitude;
          const lat = bounds && bounds.length >= 2 ? (bounds[0][1] + bounds[1][1]) / 2 : view.latitude;
          setView(current => {
            const samePlace = Math.abs(current.latitude - lat) < 0.0015 && Math.abs(current.longitude - lon) < 0.0015;
            const sameZoom = Math.abs(current.zoom - native.zoom) < 0.25;
            if (samePlace && sameZoom) {
              return current;
            }
            return {latitude: lat, longitude: lon, zoom: native.zoom};
          });
          setLook(current => {
            const nextLat = follow ? current.latitude : lat;
            const nextLon = follow ? current.longitude : lon;
            if (
              Math.abs(current.latitude - nextLat) < 0.0008 &&
              Math.abs(current.longitude - nextLon) < 0.0008 &&
              Math.abs(current.zoom - native.zoom) < 0.15
            ) {
              return current;
            }
            return {latitude: nextLat, longitude: nextLon, zoom: native.zoom};
          });
          if (!native.userInteraction) {
            return;
          }
          onGesture?.(false, native.zoom);
          onUserMove?.(native.zoom);
        }}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [longitude, latitude],
            zoom: zoomRef.current,
            bearing: course,
            pitch,
          }}
        />
        {pitched ? (
          <Layer
            id="building-3d"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            beforeId="aeroway-taxiway"
            minzoom={14.5}
            filter={['!=', ['get', 'hide_3d'], true]}
            paint={{
              'fill-extrusion-color': mode === 'dark' ? '#3C3A44' : '#D7D2C8',
              'fill-extrusion-height': ['max', ['to-number', ['get', 'render_height']], 8],
              'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0],
              'fill-extrusion-opacity': 0.96,
              'fill-extrusion-vertical-gradient': true,
            }}
          />
        ) : null}
        {localStreets.features.length > 0 ? (
          <GeoJSONSource id="local-streets" data={localStreets}>
            <Layer
              id="local-streets-line"
              type="line"
              minzoom={13}
              paint={{
                'line-color': mode === 'dark' ? '#8E86A8' : '#9AA3AE',
                'line-width': 2.4,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {houseMarks.features.length > 0 ? (
          <GeoJSONSource id="house-numbers" data={houseMarks}>
            <Layer
              id="house-number-labels"
              type="symbol"
              minzoom={15}
              layout={{
                'text-field': ['get', 'house'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-allow-overlap': false,
                'text-padding': 2,
              }}
              paint={{
                'text-color': mode === 'dark' ? '#F4F0FF' : '#3A3348',
                'text-halo-color': mode === 'dark' ? '#1C1430' : '#F7F4EE',
                'text-halo-width': 1.4,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {otherRoutes.length > 0 ? (
          <GeoJSONSource
            id="route-options"
            data={otherShape}
            hitbox={{top: 22, right: 22, bottom: 22, left: 22}}
            onPress={event => {
              event.stopPropagation();
              const raw = event.nativeEvent.features[0]?.properties?.id;
              const index = typeof raw === 'number' ? raw : Number(raw);
              const picked = otherRoutes[index];
              if (picked) {
                onAlternative?.(picked);
              }
            }}>
            <Layer
              id="route-options-line"
              type="line"
              beforeId={streetLabels}
              layout={{'line-cap': 'round', 'line-join': 'round'}}
              paint={{'line-color': colors.route, 'line-width': 5, 'line-opacity': 0.72}}
            />
          </GeoJSONSource>
        ) : null}
        {routeShape ? (
          <GeoJSONSource id="route" data={routeShape}>
            <Layer
              id="route-line"
              type="line"
              beforeId={streetLabels}
              layout={{'line-cap': 'round', 'line-join': 'round'}}
              paint={{'line-color': colors.route, 'line-width': 7}}
            />
          </GeoJSONSource>
        ) : null}
        {routeNames.features.length > 0 ? (
          <GeoJSONSource id="route-names" data={routeNames}>
            <Layer
              id="route-street-names"
              type="symbol"
              layout={{
                'symbol-placement': 'line',
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 14,
                'text-max-angle': 28,
                'text-padding': 4,
                'text-keep-upright': true,
              }}
              paint={{
                'text-color': '#1C1430',
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 2.4,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {gpsAccuracy != null ? (
          <GeoJSONSource id="gps-accuracy" data={accuracyFeature(latitude, longitude, gpsAccuracy)}>
            <Layer
              id="gps-accuracy-fill"
              type="fill"
              paint={{'fill-color': '#7DCEA0', 'fill-opacity': 0.22}}
            />
          </GeoJSONSource>
        ) : null}
        {showUncertainty && uncertainty != null ? (
          <GeoJSONSource id="uncertainty" data={uncertaintyFeature(latitude, longitude, uncertainty)}>
            <Layer
              id="uncertainty-fill"
              type="fill"
              paint={{'fill-color': '#8B74E8', 'fill-opacity': 0.16}}
            />
          </GeoJSONSource>
        ) : null}
        {!tracking && route && route.coordinates.length > 1 ? (
          <Marker id="route-badge" lngLat={pointAlong(route.coordinates, 0.62)} anchor="center">
            <RouteTimeBadge
              label={minuteText(route.durationS, copy.minutes)}
              best={route.durationS <= fastestSeconds(route, otherRoutes) ? copy.bestBadge : undefined}
              active
            />
          </Marker>
        ) : null}
        {otherRoutes.map((item, index) => (
          <Marker
            key={`alt-badge-${item.distanceM}-${item.coordinates.length}`}
            id={`alt-badge-${index}`}
            lngLat={labelPoint(item.coordinates, route?.coordinates ?? null)}
            anchor="center">
            <RouteTimeBadge
              label={minuteText(item.durationS, copy.minutes)}
              best={item.durationS <= fastestSeconds(route, otherRoutes) ? copy.bestBadge : undefined}
              onPress={() => onAlternative?.(item)}
            />
          </Marker>
        ))}
        {!googleLive && placeIcons
          ? nearby.map(place => (
              <Marker
                key={place.id}
                id={`poi-${place.id}`}
                lngLat={[place.longitude, place.latitude]}
                anchor={picked?.id === place.id ? 'bottom' : 'center'}
                onPress={() => choosePlace(place)}>
                <View style={styles.poiWrap} pointerEvents="box-none">
                  {picked?.id === place.id ? (
                    <PlaceCard
                      place={place}
                      here={{latitude, longitude}}
                      hours={hours}
                      copy={copy}
                      onGo={() => onPlaceGo?.(place)}
                      onClose={() => setPicked(null)}
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => choosePlace(place)}
                    style={[
                      styles.poi,
                      {backgroundColor: nearbyColors[place.kind]},
                      picked?.id === place.id ? styles.poiOn : null,
                    ]}>
                    <Text style={styles.poiMark}>{nearbyMarks[place.kind]}</Text>
                  </Pressable>
                </View>
              </Marker>
            ))
          : null}
        {destination ? (
          <Marker
            key={`${destination.longitude}-${destination.latitude}`}
            id="destination"
            lngLat={[destination.longitude, destination.latitude]}
            anchor={route && !tracking ? 'bottom-left' : destinationPin ? 'bottom' : 'center'}>
            <View style={styles.destWrap}>
              {destination.name ? (
                <View style={styles.destName}>
                  <Text numberOfLines={2} style={styles.destNameText}>
                    {destination.name}
                  </Text>
                </View>
              ) : null}
              {route && !tracking ? <CheckeredFlag /> : destinationPin ? <DropPin /> : <View style={styles.destPin} />}
            </View>
          </Marker>
        ) : null}
        {pinned || !located ? null : (
          <Marker id="vehicle" lngLat={[longitude, latitude]} anchor="center">
            <VehicleMarker navigating={tracking} rotation={tracking && headingUp ? 0 : heading} />
          </Marker>
        )}
      </Map>
      {useGoogle ? (
        <View
          pointerEvents={googleLive ? 'auto' : 'none'}
          style={[styles.google, {opacity: googleLive ? 1 : 0}]}>
          <GoogleRoadMap
            latitude={latitude}
            longitude={longitude}
            zoom={zoomRef.current}
            heading={course}
            follow={follow}
            tracking={Boolean(tracking)}
            frame={frame}
            route={
              route && liveCoordinates && liveCoordinates.length > 1
                ? {...route, coordinates: liveCoordinates}
                : route
            }
            alternatives={otherRoutes}
            destination={destination ?? null}
            routeColor={colors.route}
            language={language}
            fitToken={fitToken}
            showUser={!pinned && located}
            placeIcons={placeIcons}
            nearby={nearby}
            onUserMove={onUserMove}
            onGesture={onGesture}
            onLook={(lookLatitude, lookLongitude, lookZoom) => {
              setLook(current => {
                const nextLat = follow ? current.latitude : lookLatitude;
                const nextLon = follow ? current.longitude : lookLongitude;
                if (
                  Math.abs(current.latitude - nextLat) < 0.0008 &&
                  Math.abs(current.longitude - nextLon) < 0.0008 &&
                  Math.abs(current.zoom - lookZoom) < 0.15
                ) {
                  return current;
                }
                return {latitude: nextLat, longitude: nextLon, zoom: lookZoom};
              });
            }}
            onMapPress={(pressLongitude, pressLatitude) => {
              setPicked(null);
              onMapPress?.(pressLongitude, pressLatitude);
            }}
            onPlace={place => choosePlace(place)}
            onAlternative={onAlternative}
            onReady={() => setGoogleLive(true)}
            onFail={() => {
              setGoogleLive(false);
            }}
          />
        </View>
      ) : null}
      {pinned && located ? (
        <View pointerEvents="none" style={[styles.chevron, {top: driveFocal(frame) - 32}]}>
          <VehicleMarker navigating rotation={googleLive ? heading : 0} />
        </View>
      ) : null}
      {googleLive && picked ? (
        <View pointerEvents="box-none" style={styles.poiFloat}>
          <PlaceCard
            place={picked}
            here={{latitude, longitude}}
            hours={hours}
            copy={copy}
            onGo={() => onPlaceGo?.(picked)}
            onClose={() => setPicked(null)}
          />
        </View>
      ) : null}
      {googleLive ? null : (
        <Text style={[type.caption, styles.attribution]}>
          © OpenStreetMap contributors
        </Text>
      )}
      {frameWidth > 0 && (visibleCityDistricts.length > 0 || visibleHoods.length > 0) ? (
        <View pointerEvents="none" style={styles.areaNames}>
          {visibleCityDistricts.map(item => {
            const point = projectOnMap(
              item.lat,
              item.lon,
              look.latitude,
              look.longitude,
              look.zoom,
              frameWidth,
              frame,
            );
            if (!point) {
              return null;
            }
            return (
              <Text
                key={`city-${item.name}-${item.lat}`}
                style={[
                  styles.cityDistrict,
                  mode === 'dark' ? styles.cityDistrictDark : null,
                  {left: point.x, top: point.y},
                ]}>
                {item.name}
              </Text>
            );
          })}
          {visibleHoods.map(item => {
            const point = projectOnMap(
              item.lat,
              item.lon,
              look.latitude,
              look.longitude,
              look.zoom,
              frameWidth,
              frame,
            );
            if (!point) {
              return null;
            }
            return (
              <Text
                key={`hood-${item.name}-${item.lat}`}
                style={[
                  styles.hoodDistrict,
                  mode === 'dark' ? styles.hoodDistrictDark : null,
                  {left: point.x, top: point.y},
                ]}>
                {item.name}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function mercatorY(latitude: number): number {
  const rad = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function projectOnMap(
  latitude: number,
  longitude: number,
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number,
): {x: number; y: number} | null {
  const world = 256 * 2 ** Math.min(22, Math.max(1, zoom));
  const x = width / 2 + ((longitude - centerLon) / 360) * world;
  const y = height / 2 - ((mercatorY(latitude) - mercatorY(centerLat)) / (2 * Math.PI)) * world;
  if (x < -80 || y < -30 || x > width + 80 || y > height + 30) {
    return null;
  }
  return {x, y};
}

function nearestPlace(places: NearbyPlace[], latitude: number, longitude: number, zoom: number): NearbyPlace | null {
  const limit = zoom >= 16 ? 70 : zoom >= 14 ? 120 : 180;
  let best: NearbyPlace | null = null;
  let away = limit;
  places.forEach(place => {
    const meters = haversineMeters(latitude, longitude, place.latitude, place.longitude);
    if (meters < away) {
      away = meters;
      best = place;
    }
  });
  return best;
}

function poiKindLabel(kind: NearbyPlace['kind'], copy: ReturnType<typeof uiCopy>): string {
  if (kind === 'pharmacy') {
    return copy.poiPharmacy;
  }
  if (kind === 'food') {
    return copy.poiFood;
  }
  if (kind === 'cafe') {
    return copy.poiCafe;
  }
  if (kind === 'train') {
    return copy.poiTrain;
  }
  if (kind === 'bus') {
    return copy.poiBus;
  }
  return copy.poiGov;
}

function PlaceCard({
  place,
  here,
  hours,
  copy,
  onGo,
  onClose,
}: {
  place: NearbyPlace;
  here: {latitude: number; longitude: number};
  hours: PlaceHours | null;
  copy: ReturnType<typeof uiCopy>;
  onGo: () => void;
  onClose: () => void;
}) {
  const away = formatDistance(haversineMeters(here.latitude, here.longitude, place.latitude, place.longitude));
  const open = hours?.openNow ?? place.openNow;
  const today = hours?.today;
  return (
    <View style={styles.card}>
      <View style={styles.cardCopy}>
        <Text numberOfLines={2} style={styles.cardName}>
          {place.name}
        </Text>
        <Text numberOfLines={1} style={styles.cardMeta}>
          {poiKindLabel(place.kind, copy)} · {away}
        </Text>
        {open != null ? (
          <Text numberOfLines={1} style={[styles.cardHours, open === false ? styles.cardShut : null]}>
            {open ? copy.poiOpen : copy.poiClosed}
          </Text>
        ) : null}
        {today ? (
          <Text numberOfLines={2} style={styles.cardTime}>
            {today}
          </Text>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.cardX}>
        <Text style={styles.cardXMark}>×</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose();
          onGo();
        }}
        style={styles.cardGo}>
        <View style={styles.goHead} />
        <View style={styles.goShaft} />
      </Pressable>
    </View>
  );
}

function sameRoute(left: RoutePlan, right: RoutePlan): boolean {
  return left === right || (left.distanceM === right.distanceM && left.coordinates.length === right.coordinates.length);
}

function minuteText(seconds: number, unit: string): string {
  return `${Math.max(1, Math.round(seconds / 60))} ${unit}`;
}

function fastestSeconds(route: RoutePlan | null, others: RoutePlan[]): number {
  const start = route?.durationS ?? Number.POSITIVE_INFINITY;
  return others.reduce((min, item) => Math.min(min, item.durationS), start);
}

function pointAlong(coordinates: Array<[number, number]>, fraction: number): [number, number] {
  const index = Math.min(coordinates.length - 1, Math.max(0, Math.round((coordinates.length - 1) * fraction)));
  return coordinates[index];
}

function labelPoint(coordinates: Array<[number, number]>, avoid: Array<[number, number]> | null): [number, number] {
  if (!avoid || coordinates.length < 4) {
    return pointAlong(coordinates, 0.45);
  }
  let best = pointAlong(coordinates, 0.45);
  let bestAway = 0;
  const step = Math.max(1, Math.floor(coordinates.length / 20));
  for (let index = step; index < coordinates.length - step; index += step) {
    const [lon, lat] = coordinates[index];
    const away = distanceToRoute(avoid, lat, lon);
    if (away > bestAway) {
      bestAway = away;
      best = coordinates[index];
    }
  }
  return best;
}

function RouteTimeBadge({
  label,
  best,
  active,
  onPress,
}: {
  label: string;
  best?: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.badge, active ? styles.badgeOn : styles.badgeOff]}>
      <Text style={[styles.badgeTime, active ? styles.badgeTimeOn : styles.badgeTimeOff]}>{label}</Text>
      {best ? <Text style={[styles.badgeBest, active ? styles.badgeBestOn : styles.badgeBestOff]}>{best}</Text> : null}
    </Pressable>
  );
}

function CheckeredFlag() {
  const squares = [0, 1, 2, 3].flatMap(row =>
    [0, 1, 2, 3].map(col => (
      <View
        key={`${row}-${col}`}
        style={[styles.flagSquare, {backgroundColor: (row + col) % 2 === 0 ? '#1A1A1A' : '#FFFFFF'}]}
      />
    )),
  );
  return (
    <View style={styles.flag}>
      <View style={styles.flagPole} />
      <View style={styles.flagCloth}>{squares}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  google: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  chevron: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  attribution: {
    position: 'absolute',
    left: 12,
    bottom: 8,
    color: '#8E84A3',
  },
  areaNames: {
    ...StyleSheet.absoluteFill,
    zIndex: 8,
  },
  cityDistrict: {
    position: 'absolute',
    width: 150,
    marginLeft: -75,
    marginTop: -8,
    color: '#3F4654',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
    textShadowColor: '#F4F1EA',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },
  cityDistrictDark: {
    color: '#D8D3E6',
    textShadowColor: '#1C1430',
  },
  hoodDistrict: {
    position: 'absolute',
    width: 140,
    marginLeft: -70,
    marginTop: -8,
    color: '#5A6270',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: '#F4F1EA',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },
  hoodDistrictDark: {
    color: '#C8C2D6',
    textShadowColor: '#1C1430',
  },
  destWrap: {alignItems: 'center', gap: 4},
  destName: {
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  destNameText: {color: '#1C1430', fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center'},
  destPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#6B4EE0',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  poi: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  poiOn: {width: 26, height: 26, borderRadius: 13},
  poiMark: {color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: '800'},
  poiWrap: {alignItems: 'center', gap: 6},
  poiFloat: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 88,
    alignItems: 'center',
    zIndex: 8,
  },
  card: {
    width: 340,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1430',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  cardCopy: {flex: 1, gap: 3},
  cardName: {color: '#1C1430', fontSize: 17, lineHeight: 21, fontWeight: '800'},
  cardMeta: {color: '#6E7680', fontSize: 14, lineHeight: 18, fontWeight: '600'},
  cardHours: {color: '#1B8A4A', fontSize: 14, lineHeight: 18, fontWeight: '700'},
  cardTime: {color: '#3A3348', fontSize: 14, lineHeight: 18, fontWeight: '600'},
  cardShut: {color: '#C0392B'},
  cardX: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  cardXMark: {color: '#1C1430', fontSize: 24, lineHeight: 26, fontWeight: '500'},
  cardGo: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#6B4EE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  goShaft: {width: 3, height: 7, borderRadius: 1, backgroundColor: '#FFFFFF', marginTop: -1},
  badge: {
    minWidth: 64,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    shadowColor: '#1C1430',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 4,
  },
  badgeOn: {backgroundColor: '#6B4EE0'},
  badgeOff: {backgroundColor: '#FFFFFF'},
  badgeTime: {fontSize: 15, lineHeight: 18, fontWeight: '800'},
  badgeTimeOn: {color: '#FFFFFF'},
  badgeTimeOff: {color: '#1C1430'},
  badgeBest: {fontSize: 12, lineHeight: 15, fontWeight: '700'},
  badgeBestOn: {color: '#FFFFFF'},
  badgeBestOff: {color: '#6B4EE0'},
  flag: {width: 28, height: 34},
  flagPole: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2,
    height: 34,
    borderRadius: 1,
    backgroundColor: '#1A1A1A',
  },
  flagCloth: {
    marginLeft: 2,
    width: 20,
    height: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  flagSquare: {width: 5, height: 5},
  drop: {width: 36, height: 48, alignItems: 'center'},
  dropHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6B4EE0',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropHole: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF'},
  dropTip: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#6B4EE0',
  },
});

function DropPin() {
  return (
    <View style={styles.drop}>
      <View style={styles.dropHead}>
        <View style={styles.dropHole} />
      </View>
      <View style={styles.dropTip} />
    </View>
  );
}
