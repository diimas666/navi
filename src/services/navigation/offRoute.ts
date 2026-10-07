import {projectOntoSegment} from '../../utils/geo';

const OFF_ROUTE_M = 38;
const FAR_OFF_M = 85;
const COOLDOWN_MS = 3_500;
const FAR_COOLDOWN_MS = 6_000;

export function distanceToRoute(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
): number {
  if (coordinates.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [startLon, startLat] = coordinates[index - 1];
    const [endLon, endLat] = coordinates[index];
    const projected = projectOntoSegment(latitude, longitude, startLat, startLon, endLat, endLon);
    if (projected.distanceM < best) {
      best = projected.distanceM;
    }
  }
  return best;
}

export function shouldRebuild(distanceM: number, _speedMps: number, elapsedMs: number): boolean {
  if (distanceM >= FAR_OFF_M && elapsedMs >= FAR_COOLDOWN_MS) {
    return true;
  }
  return distanceM >= OFF_ROUTE_M && elapsedMs >= COOLDOWN_MS;
}
