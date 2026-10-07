import {memo, useEffect, useMemo, useRef, useState, type MutableRefObject} from 'react';
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
import {loadBasemapStyle} from '../services/maps/basemapStyle';
import {cityDistrictFeatures, cityNameFeatures, districtFeatures} from '../services/maps/districts';
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
import {MAP_FONT_BOLD, MAP_FONT_REGULAR} from '../services/maps/mapFonts';
import {buildingLayerVisibility} from '../services/maps/mapLayers';
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
  stops?: Array<{longitude: number; latitude: number; name?: string}>;
  tracking?: boolean;
  headingUp?: boolean;
  fitToken?: number;
  buildings3d?: boolean;
  speedMps?: number;
  located?: boolean;
  nightMap?: boolean;
};

export const NaviMap = memo(function NaviMap({
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
  stops = [],
  tracking,
  headingUp = true,
  fitToken = 0,
  buildings3d = false,
  speedMps = 0,
  located = true,
  nightMap = false,
}: Props) {
  const {colors, mode} = useTheme();
  const mapMode = nightMap ? 'dark' : mode;
  const language = useSettingsStore(state => state.language);
  const placeIcons = useSettingsStore(state => state.placeIcons);
  const copy = uiCopy(language);
  const cameraRef = useRef<CameraRef>(null);
  const lastCameraMove = useRef(0);
  const lastPitch = useRef(0);
  const pitchArmed = useRef(false);
  const lastPinned = useRef(false);
  const holdingMap = useRef(false);
  const lastFollow = useRef({latitude, longitude});
  const startCamera = useRef({
    center: [longitude, latitude] as [number, number],
    zoom: zoomRef.current,
  });
  const [frameHeight, setFrameHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const pitched = Boolean(buildings3d && tracking);
  const streetLabels = mapMode === 'dark' ? 'highway_name_other' : 'highway-name-path';
  const pinned = Boolean(tracking && follow && headingUp);
  const frame = frameHeight || 780;
  const heldHeading = useRef(heading);
  if (speedMps >= 2.2) {
    heldHeading.current = heading;
  }
  const cameraHeading = speedMps >= 2.2 ? heading : heldHeading.current;
  const course = pinned
    ? driveBearing(route?.coordinates, latitude, longitude, cameraHeading, speedMps)
    : tracking && headingUp
      ? cameraHeading
      : 0;
  const pitch = pitched ? 58 : 0;
  const [basemap, setBasemap] = useState<StyleSpecification | null>(null);
  const [view, setView] = useState({latitude, longitude, zoom: zoomRef.current});
  const online = useMapStore(state => state.online);
  const linkKnown = useMapStore(state => state.linkKnown);
  const offlineMap = linkKnown && !online;
  const [look, setLook] = useState({latitude, longitude, zoom: zoomRef.current});
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [picked, setPicked] = useState<NearbyPlace | null>(null);
  const [hours, setHours] = useState<PlaceHours | null>(null);
  const styleKind = `${mapMode}:${basemap ? 'styled' : 'url'}`;
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

  const cityNameMarks = useMemo(() => cityNameFeatures(), []);
  const cityDistrictMarks = useMemo(() => cityDistrictFeatures(), []);
  const hoodMarks = useMemo(() => districtFeatures(), []);
  const showAreaNames = !pitched;
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
    const ranked = housesNear(lat, lon, 0.02)
      .filter(house => house.house.length > 0 && !house.entrance)
      .map(house => ({
        house,
        offset: Math.abs(house.latitude - lat) + Math.abs(house.longitude - lon),
      }))
      .sort((left, right) => left.offset - right.offset)
      .slice(0, 1800);
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
  const progressKey = tracking ? `${latitude.toFixed(4)}:${longitude.toFixed(4)}` : '';
  const liveCoordinates = useMemo(() => {
    if (tracking && route && route.coordinates.length > 1) {
      const [latText, lonText] = progressKey.split(':');
      return remainingCoordinates(route.coordinates, Number(latText), Number(lonText));
    }
    return route?.coordinates;
  }, [tracking, route, progressKey]);
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
    loadBasemapStyle(mapMode).then(style => {
      if (live && style) {
        setBasemap(style);
      }
    });
    return () => {
      live = false;
    };
  }, [mapMode]);

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
    const lines = [route.coordinates, ...otherRoutes.map(item => item.coordinates)];
    lines.forEach(line => {
      line.forEach(([pointLon, pointLat]) => {
        west = Math.min(west, pointLon);
        south = Math.min(south, pointLat);
        east = Math.max(east, pointLon);
        north = Math.max(north, pointLat);
      });
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
  }, [fitToken, mapReady, otherRoutes, route, tracking]);

  useEffect(() => {
    if (!mapReady || !follow || holdingMap.current) {
      return;
    }
    const now = Date.now();
    const elapsed = lastCameraMove.current === 0 ? 480 : now - lastCameraMove.current;
    const pitchChanged = lastPitch.current !== pitch;
    const pinChanged = lastPinned.current !== pinned;
    const moved = haversineMeters(
      lastFollow.current.latitude,
      lastFollow.current.longitude,
      latitude,
      longitude,
    );
    lastPitch.current = pitch;
    lastPinned.current = pinned;
    if (!pitchChanged && !pinChanged && elapsed < (pinned ? 70 : tracking ? 120 : 280)) {
      return;
    }
    if (!tracking && !pinChanged && !pitchChanged && moved < 22) {
      return;
    }
    lastFollow.current = {latitude, longitude};
    lastCameraMove.current = now;
    try {
      settleCamera(
        cameraRef.current?.easeTo({
          center: [longitude, latitude],
          bearing: course,
          zoom: zoomRef.current,
          pitch,
          duration: pitchChanged ? 480 : pinned ? glideDuration(elapsed) : tracking ? 280 : 160,
          easing: pinned ? 'linear' : 'ease',
          ...(pinned || pinChanged
            ? {padding: pinned ? drivePadding(frame) : {top: 0, right: 0, bottom: 0, left: 0}}
            : null),
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
        setFrameHeight(current => (current === nextHeight ? current : nextHeight));
      }}>
      <Map
        style={styles.fill}
        mapStyle={chooseMapStyle(linkKnown && !online, basemap, mapMode)}
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
        logo
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
          holdingMap.current = true;
          const camera = cameraRef.current as {stop?: () => void} | null;
          camera?.stop?.();
          onGesture?.(true, event.nativeEvent.zoom);
        }}
        onRegionIsChanging={event => {
          if (!event.nativeEvent.userInteraction) {
            return;
          }
          holdingMap.current = true;
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
          holdingMap.current = false;
          onGesture?.(false, native.zoom);
          onUserMove?.(native.zoom);
        }}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: startCamera.current.center,
            zoom: startCamera.current.zoom,
            bearing: 0,
            pitch: 0,
          }}
        />
        <Layer
          id="building-3d"
          type="fill-extrusion"
          source="openmaptiles"
          source-layer="building"
          beforeId={streetLabels}
          minzoom={14.5}
          filter={['!=', ['get', 'hide_3d'], true]}
          layout={{visibility: buildingLayerVisibility(pitched)['building-3d']}}
          paint={{
            'fill-extrusion-color': mapMode === 'dark' ? '#6A7384' : '#D7D2C8',
            'fill-extrusion-height': ['max', ['to-number', ['get', 'render_height']], 8],
            'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0],
            'fill-extrusion-opacity': 0.96,
            'fill-extrusion-vertical-gradient': true,
          }}
        />
        <Layer
          id="building-2d"
          type="fill"
          source="openmaptiles"
          source-layer="building"
          beforeId={streetLabels}
          minzoom={13}
          layout={{visibility: buildingLayerVisibility(pitched)['building-2d']}}
          paint={{
            'fill-color': mapMode === 'dark' ? '#6B7484' : '#D4CFC4',
            'fill-opacity': 0.94,
            'fill-outline-color': mapMode === 'dark' ? '#4A5260' : '#C4BDB0',
          }}
        />
        <Layer
          id="tile-housenumbers"
          type="symbol"
          source="openmaptiles"
          source-layer="housenumber"
          minzoom={14}
          layout={{
            'text-field': ['to-string', ['coalesce', ['get', 'housenumber'], ['get', 'name']]],
            'text-font': MAP_FONT_REGULAR,
            'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 17, 13, 19, 16],
            'text-padding': 1,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color': mapMode === 'dark' ? '#F0ECF8' : '#3A3348',
            'text-halo-color': mapMode === 'dark' ? '#1C1430' : '#FFFFFF',
            'text-halo-width': 1.6,
          }}
        />
        {showAreaNames ? (
          <>
            <GeoJSONSource id="city-names" data={cityNameMarks}>
              <Layer
                id="city-name-labels"
                type="symbol"
                minzoom={8.4}
                maxzoom={12.4}
                layout={{
                  'text-field': ['get', 'name'],
                  'text-font': MAP_FONT_BOLD,
                  'text-size': 18,
                  'text-transform': 'uppercase',
                  'text-letter-spacing': 0.12,
                  'text-padding': 12,
                  'text-max-width': 8,
                  'text-allow-overlap': true,
                  'text-ignore-placement': true,
                  'text-optional': true,
                }}
                paint={{
                  'text-color': mapMode === 'dark' ? '#EEECF6' : '#2E3542',
                  'text-halo-color': mapMode === 'dark' ? '#1C1430' : '#F4F1EA',
                  'text-halo-width': 1.8,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="city-districts" data={cityDistrictMarks}>
              <Layer
                id="city-district-labels"
                type="symbol"
                minzoom={8.6}
                maxzoom={11.2}
                layout={{
                  'text-field': ['get', 'name'],
                  'text-font': MAP_FONT_BOLD,
                  'text-size': 13,
                  'text-transform': 'uppercase',
                  'text-letter-spacing': 0.08,
                  'text-padding': 16,
                  'text-max-width': 8,
                  'text-allow-overlap': true,
                  'text-ignore-placement': true,
                  'text-optional': true,
                }}
                paint={{
                  'text-color': mapMode === 'dark' ? '#D8D3E6' : '#3F4654',
                  'text-halo-color': mapMode === 'dark' ? '#1C1430' : '#F4F1EA',
                  'text-halo-width': 1.4,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="hood-labels" data={hoodMarks}>
              <Layer
                id="hood-name-labels"
                type="symbol"
                minzoom={11}
                maxzoom={16.4}
                layout={{
                  'text-field': ['get', 'name'],
                  'text-font': MAP_FONT_BOLD,
                  'text-size': 15,
                  'text-transform': 'uppercase',
                  'text-letter-spacing': 0.06,
                  'text-padding': 18,
                  'text-max-width': 9,
                  'text-allow-overlap': true,
                  'text-ignore-placement': true,
                  'text-optional': true,
                }}
                paint={{
                  'text-color': mapMode === 'dark' ? '#C8C2D6' : '#4A5260',
                  'text-halo-color': mapMode === 'dark' ? '#1C1430' : '#F4F1EA',
                  'text-halo-width': 1.6,
                }}
              />
            </GeoJSONSource>
          </>
        ) : null}
        {localStreets.features.length > 0 ? (
          <GeoJSONSource id="local-streets" data={localStreets}>
            <Layer
              id="local-streets-line"
              type="line"
              minzoom={13}
              paint={{
                'line-color': mapMode === 'dark' ? '#8E86A8' : '#9AA3AE',
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
              minzoom={14}
              layout={{
                'text-field': ['get', 'house'],
                'text-font': MAP_FONT_REGULAR,
                'text-size': 13,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
                'text-optional': false,
                'text-padding': 1,
              }}
              paint={{
                'text-color': mapMode === 'dark' ? '#F4F0FF' : '#2A2438',
                'text-halo-color': mapMode === 'dark' ? '#1C1430' : '#FFFFFF',
                'text-halo-width': 1.8,
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
                'text-font': MAP_FONT_REGULAR,
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
        {placeIcons
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
        {stops.map((stop, index) => (
          <Marker
            key={`stop-${stop.longitude}-${stop.latitude}-${index}`}
            id={`stop-${index}`}
            lngLat={[stop.longitude, stop.latitude]}
            anchor="center">
            <View style={styles.stopWrap}>
              {!tracking && stop.name ? (
                <View style={styles.destName}>
                  <Text numberOfLines={1} style={styles.destNameText}>
                    {stop.name}
                  </Text>
                </View>
              ) : null}
              <View style={styles.stopPin}>
                <Text style={styles.stopLetter}>{waypointLetter(index)}</Text>
              </View>
            </View>
          </Marker>
        ))}
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
        {!located || pinned ? null : (
          <Marker id="vehicle" lngLat={[longitude, latitude]} anchor="center">
            <VehicleMarker navigating={tracking} rotation={tracking && headingUp ? 0 : heading} />
          </Marker>
        )}
      </Map>
      {pinned && located ? (
        <View pointerEvents="none" style={[styles.chevron, {top: driveFocal(frame) - 32}]}>
          <VehicleMarker navigating rotation={0} />
        </View>
      ) : null}
      <Text style={[type.caption, styles.attribution]}>
        © OpenStreetMap contributors · MapLibre
      </Text>
    </View>
  );
});

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

function waypointLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
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
  fill: {flex: 1, overflow: 'hidden', zIndex: 0},
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
    zIndex: 2,
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
  stopWrap: {alignItems: 'center', gap: 4},
  stopPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6B4EE0',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopLetter: {color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '800'},
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
