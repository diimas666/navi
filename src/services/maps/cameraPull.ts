import {bearingDegrees, destinationPoint, haversineMeters} from '../../utils/geo';

const FOCAL = 0.68;
const BOTTOM = 0.08;

export function drivePadding(height: number): {top: number; right: number; bottom: number; left: number} {
  const h = Math.max(1, height);
  const bottom = Math.round(h * BOTTOM);
  const top = Math.max(0, Math.round(2 * FOCAL * h - h + bottom));
  return {top, right: 28, bottom, left: 28};
}

export function driveFocal(height: number): number {
  const pad = drivePadding(height);
  return pad.top + (height - pad.top - pad.bottom) / 2;
}

export function glideDuration(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 360;
  }
  return Math.min(900, Math.max(200, Math.round(elapsedMs * 1.15)));
}

export function pointAlongMeters(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
  meters: number,
): {latitude: number; longitude: number} | null {
  if (coordinates.length < 2 || meters <= 0) {
    return null;
  }
  let bestOff = Infinity;
  let bestIndex = 1;
  let bestRatio = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1];
    const [lonB, latB] = coordinates[index];
    const segment = haversineMeters(latA, lonA, latB, lonB);
    const toStart = haversineMeters(latitude, longitude, latA, lonA);
    const toEnd = haversineMeters(latitude, longitude, latB, lonB);
    const off = Math.abs(toStart + toEnd - segment);
    if (off < bestOff) {
      bestOff = off;
      bestIndex = index;
      bestRatio = segment === 0 ? 0 : Math.min(1, Math.max(0, toStart / segment));
    }
  }
  let [lon, lat] = coordinates[bestIndex - 1];
  const [endLon, endLat] = coordinates[bestIndex];
  let remain = meters;
  const segment = haversineMeters(lat, lon, endLat, endLon);
  if (segment > 0) {
    const bearing = bearingDegrees(lat, lon, endLat, endLon);
    const into = segment * bestRatio;
    const start = destinationPoint(lat, lon, into, bearing);
    const left = segment - into;
    if (remain <= left) {
      return destinationPoint(start.latitude, start.longitude, remain, bearing);
    }
    remain -= left;
    lat = endLat;
    lon = endLon;
  }
  for (let index = bestIndex + 1; index < coordinates.length; index += 1) {
    const [nextLon, nextLat] = coordinates[index];
    const length = haversineMeters(lat, lon, nextLat, nextLon);
    if (length <= 0) {
      continue;
    }
    if (remain <= length) {
      return destinationPoint(lat, lon, remain, bearingDegrees(lat, lon, nextLat, nextLon));
    }
    remain -= length;
    lat = nextLat;
    lon = nextLon;
  }
  return {latitude: lat, longitude: lon};
}

export function driveBearing(
  coordinates: Array<[number, number]> | null | undefined,
  latitude: number,
  longitude: number,
  heading: number,
  speedMps: number,
): number {
  const look = Math.min(90, Math.max(28, 24 + Math.max(0, speedMps) * 2));
  if (!coordinates || coordinates.length < 2) {
    return heading;
  }
  const ahead = pointAlongMeters(coordinates, latitude, longitude, look);
  if (!ahead) {
    return heading;
  }
  if (haversineMeters(latitude, longitude, ahead.latitude, ahead.longitude) < 8) {
    return heading;
  }
  const next = bearingDegrees(latitude, longitude, ahead.latitude, ahead.longitude);
  let delta = next - heading;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  if (Math.abs(delta) > 75) {
    return heading;
  }
  return next;
}
