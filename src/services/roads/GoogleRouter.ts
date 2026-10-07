import {Platform} from 'react-native';

import {GOOGLE_MAPS_KEY} from '../../constants/googleMapsKey';
import type {RoutePlan} from '../../models/domain';
import {uiCopy} from '../../i18n/uiCopy';
import {useSettingsStore} from '../../store/settingsStore';
import {geometryStartsNear} from '../navigation/placeFix';

const HEADERS: Record<string, string> =
  Platform.OS === 'ios' ? {'X-Ios-Bundle-Identifier': 'com.neiv.app'} : {};

export function googleDrivingReady(): boolean {
  return GOOGLE_MAPS_KEY.length > 20;
}

export async function googleDrivingRoutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  stops: Array<{latitude: number; longitude: number}> = [],
): Promise<RoutePlan[]> {
  if (!googleDrivingReady()) {
    return [];
  }
  try {
    const modern = await routesApiRoutes(originLat, originLon, destinationLat, destinationLon, stops);
    if (modern.length > 0) {
      return modern;
    }
  } catch {
    // Routes API is off on the AutoCare key. Legacy Directions may still answer.
  }
  const language = useSettingsStore.getState().language === 'ru' ? 'ru' : 'uk';
  const params = new URLSearchParams({
    origin: `${originLat},${originLon}`,
    destination: `${destinationLat},${destinationLon}`,
    mode: 'driving',
    alternatives: stops.length > 0 ? 'false' : 'true',
    language,
    region: 'ua',
    units: 'metric',
    key: GOOGLE_MAPS_KEY,
  });
  if (stops.length > 0) {
    params.set('waypoints', stops.map(stop => `${stop.latitude},${stop.longitude}`).join('|'));
  }
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    status?: string;
    routes?: Array<{
      overview_polyline?: {points?: string};
      legs?: Array<{
        distance?: {value?: number};
        duration?: {value?: number};
        steps?: Array<{
          html_instructions?: string;
          distance?: {value?: number};
          start_location?: {lat?: number; lng?: number};
          polyline?: {points?: string};
          maneuver?: string;
        }>;
      }>;
    }>;
  };
  if (payload.status !== 'OK' || !payload.routes) {
    return [];
  }
  const streets = uiCopy(useSettingsStore.getState().language).streets;
  return payload.routes.flatMap(route => {
    const coordinates = decodePolyline(route.overview_polyline?.points ?? '');
    if (coordinates.length < 2 || !geometryStartsNear(coordinates, originLat, originLon, 80_000)) {
      return [];
    }
    const legs = route.legs ?? [];
    const distanceM = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
    const durationS = legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
    let alongM = 0;
    const steps = legs.flatMap(leg =>
      (leg.steps ?? []).map(step => {
        const item = {
          name: streetName(step.html_instructions, streets),
          distanceM: step.distance?.value ?? 0,
          alongM,
          latitude: step.start_location?.lat,
          longitude: step.start_location?.lng,
          coordinates: decodePolyline(step.polyline?.points ?? ''),
          kind: googleKind(step.maneuver),
          modifier: googleModifier(step.maneuver),
        };
        alongM += step.distance?.value ?? 0;
        return item;
      }),
    );
    const plan: RoutePlan = {
      distanceM: distanceM || polylineLength(coordinates),
      durationS: durationS || polylineLength(coordinates) / 16,
      steps: steps.length > 0 ? steps : [{name: streets, distanceM, alongM: 0, kind: 'depart'}],
      coordinates,
      via: 'street',
    };
    return [plan];
  });
}

async function routesApiRoutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  stops: Array<{latitude: number; longitude: number}>,
): Promise<RoutePlan[]> {
  const language = useSettingsStore.getState().language === 'ru' ? 'ru' : 'uk';
  const body: Record<string, unknown> = {
    origin: {location: {latLng: {latitude: originLat, longitude: originLon}}},
    destination: {location: {latLng: {latitude: destinationLat, longitude: destinationLon}}},
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: stops.length === 0,
    languageCode: language,
    regionCode: 'UA',
    units: 'METRIC',
    polylineQuality: 'HIGH_QUALITY',
  };
  if (stops.length > 0) {
    body.intermediates = stops.map(stop => ({
      location: {latLng: {latitude: stop.latitude, longitude: stop.longitude}},
    }));
  }
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask':
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.startLocation',
      ...HEADERS,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      polyline?: {encodedPolyline?: string};
      legs?: Array<{
        steps?: Array<{
          distanceMeters?: number;
          navigationInstruction?: {instructions?: string; maneuver?: string};
          polyline?: {encodedPolyline?: string};
          startLocation?: {latLng?: {latitude?: number; longitude?: number}};
        }>;
      }>;
    }>;
  };
  const streets = uiCopy(useSettingsStore.getState().language).streets;
  return (payload.routes ?? []).flatMap(route => {
    const coordinates = decodePolyline(route.polyline?.encodedPolyline ?? '');
    if (coordinates.length < 2 || !geometryStartsNear(coordinates, originLat, originLon, 80_000)) {
      return [];
    }
    let alongM = 0;
    const steps = (route.legs ?? []).flatMap(leg =>
      (leg.steps ?? []).map(step => {
        const item = {
          name: streetName(step.navigationInstruction?.instructions, streets),
          distanceM: step.distanceMeters ?? 0,
          alongM,
          latitude: step.startLocation?.latLng?.latitude,
          longitude: step.startLocation?.latLng?.longitude,
          coordinates: decodePolyline(step.polyline?.encodedPolyline ?? ''),
          kind: googleKind(step.navigationInstruction?.maneuver),
          modifier: googleModifier(step.navigationInstruction?.maneuver),
        };
        alongM += step.distanceMeters ?? 0;
        return item;
      }),
    );
    return [
      {
        distanceM: route.distanceMeters || polylineLength(coordinates),
        durationS: secondsOf(route.duration) || polylineLength(coordinates) / 16,
        steps: steps.length > 0 ? steps : [{name: streets, distanceM: route.distanceMeters ?? 0, alongM: 0, kind: 'depart'}],
        coordinates,
        via: 'street' as const,
      },
    ];
  });
}

function secondsOf(value?: string): number {
  if (!value) {
    return 0;
  }
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Number(match[1]) : 0;
}

export function decodePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    const latChange = nextDelta(encoded);
    const lonChange = nextDelta(encoded);
    lat += latChange;
    lon += lonChange;
    coordinates.push([lon / 1e5, lat / 1e5]);
  }
  function nextDelta(value: string): number {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = value.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < value.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
  return coordinates;
}

function streetName(html: string | undefined, fallback: string): string {
  if (!html) {
    return fallback;
  }
  const text = html
    .replace(/<div[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 1 ? text : fallback;
}

function googleKind(maneuver?: string): string {
  if (!maneuver) {
    return 'turn';
  }
  if (maneuver.includes('roundabout') || maneuver.includes('rotary')) {
    return 'roundabout';
  }
  if (maneuver.includes('arrive')) {
    return 'arrive';
  }
  if (maneuver.includes('depart')) {
    return 'depart';
  }
  return 'turn';
}

function googleModifier(maneuver?: string): string | undefined {
  if (!maneuver) {
    return undefined;
  }
  if (maneuver.includes('uturn')) {
    return 'uturn';
  }
  if (maneuver.includes('left')) {
    return 'left';
  }
  if (maneuver.includes('right')) {
    return 'right';
  }
  if (maneuver.includes('straight')) {
    return 'straight';
  }
  return undefined;
}

function polylineLength(coordinates: Array<[number, number]>): number {
  let meters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon, lat] = coordinates[index];
    const [prevLon, prevLat] = coordinates[index - 1];
    const dLat = ((lat - prevLat) * Math.PI) / 180;
    const dLon = ((lon - prevLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prevLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    meters += 2 * 6_378_137 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return meters;
}
