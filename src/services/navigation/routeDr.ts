import {haversineMeters} from '../../utils/geo';

/**
 * During jamming the car usually stays on the planned route. The estimate then moves along the
 * route line by the distance dead reckoning covered, so gyro heading drift cannot pull it off the
 * road. When the free estimate turns away from the line, the car left the route and the free
 * estimate is used again until GPS returns.
 */
export type RouteDrState = {
  alongM: number;
  lastLatitude: number;
  lastLongitude: number;
  left: boolean;
};

type Point = {latitude: number; longitude: number};

const MIN_LEAVE_M = 80;

export function startRouteDr(alongM: number, estimate: Point): RouteDrState {
  return {alongM, lastLatitude: estimate.latitude, lastLongitude: estimate.longitude, left: false};
}

export function stepRouteDr(
  state: RouteDrState,
  coordinates: Array<[number, number]>,
  estimate: Point,
  accuracyM: number,
): {state: RouteDrState; point: Point | null} {
  const stepM = haversineMeters(state.lastLatitude, state.lastLongitude, estimate.latitude, estimate.longitude);
  const next: RouteDrState = {
    alongM: state.alongM + stepM,
    lastLatitude: estimate.latitude,
    lastLongitude: estimate.longitude,
    left: state.left,
  };
  if (next.left || coordinates.length < 2) {
    return {state: next, point: null};
  }
  const point = pointAlong(coordinates, next.alongM);
  const gap = haversineMeters(point.latitude, point.longitude, estimate.latitude, estimate.longitude);
  if (gap > Math.max(MIN_LEAVE_M, accuracyM * 1.5)) {
    return {state: {...next, left: true}, point: null};
  }
  return {state: next, point};
}

export function pointAlong(coordinates: Array<[number, number]>, alongM: number): Point {
  let walked = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1];
    const [lonB, latB] = coordinates[index];
    const segment = haversineMeters(latA, lonA, latB, lonB);
    if (walked + segment >= alongM && segment > 0) {
      const t = Math.max(0, (alongM - walked) / segment);
      return {latitude: latA + (latB - latA) * t, longitude: lonA + (lonB - lonA) * t};
    }
    walked += segment;
  }
  const [lon, lat] = coordinates[coordinates.length - 1] ?? [0, 0];
  return {latitude: lat, longitude: lon};
}
