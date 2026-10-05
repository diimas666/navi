import {haversineMeters} from '../../utils/geo';

// CoreLocation on the iOS simulator reports this point when no custom location is set.
const APPLE_SIMULATOR = {latitude: 37.785834, longitude: -122.406417};
export const ODESA_CENTER = {latitude: 46.4825, longitude: 30.7233};
const LATCH_M = 800;
const RELEASE_M = 40_000;
const LOCAL_START_M = 25_000;

let holdingSimulator = false;

export function resetPlaceFix(): void {
  holdingSimulator = false;
}

export function placeFix(latitude: number, longitude: number): {
  latitude: number;
  longitude: number;
  replaced: boolean;
} {
  const fromApple = haversineMeters(latitude, longitude, APPLE_SIMULATOR.latitude, APPLE_SIMULATOR.longitude);
  if (fromApple < LATCH_M) {
    holdingSimulator = true;
  } else if (fromApple > RELEASE_M) {
    holdingSimulator = false;
  }
  if (!holdingSimulator) {
    return {latitude, longitude, replaced: false};
  }
  return {latitude: ODESA_CENTER.latitude, longitude: ODESA_CENTER.longitude, replaced: true};
}

export function geometryStartsNear(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
  limitM = LOCAL_START_M,
): boolean {
  const begin = coordinates[0];
  if (!begin) {
    return false;
  }
  return haversineMeters(latitude, longitude, begin[1], begin[0]) <= limitM;
}
