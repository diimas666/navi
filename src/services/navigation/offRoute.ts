import {projectOntoSegment} from '../../utils/geo';

const OFF_ROUTE_M = 70;
const MIN_SPEED_MPS = 2.5;
const COOLDOWN_MS = 20_000;

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

export function shouldRebuild(distanceM: number, speedMps: number, elapsedMs: number): boolean {
  return distanceM >= OFF_ROUTE_M && speedMps >= MIN_SPEED_MPS && elapsedMs >= COOLDOWN_MS;
}
