const EARTH_RADIUS_M = 6378137;

export function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const phiA = toRadians(latitudeA);
  const phiB = toRadians(latitudeB);
  const deltaPhi = toRadians(latitudeB - latitudeA);
  const deltaLambda = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const phiA = toRadians(latitudeA);
  const phiB = toRadians(latitudeB);
  const deltaLambda = toRadians(longitudeB - longitudeA);
  const y = Math.sin(deltaLambda) * Math.cos(phiB);
  const x =
    Math.cos(phiA) * Math.sin(phiB) -
    Math.sin(phiA) * Math.cos(phiB) * Math.cos(deltaLambda);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(
  latitude: number,
  longitude: number,
  distanceM: number,
  headingDegrees: number,
): {latitude: number; longitude: number} {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRadians(headingDegrees);
  const lat1 = toRadians(latitude);
  const lon1 = toRadians(longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {latitude: toDegrees(lat2), longitude: toDegrees(lon2)};
}

export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusM: number,
  steps = 48,
): GeoJSON.Polygon {
  const ring: Array<[number, number]> = [];
  for (let index = 0; index <= steps; index += 1) {
    const point = destinationPoint(latitude, longitude, radiusM, (index / steps) * 360);
    ring.push([point.longitude, point.latitude]);
  }
  return {type: 'Polygon', coordinates: [ring]};
}

export function projectOntoSegment(
  latitude: number,
  longitude: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): {latitude: number; longitude: number; distanceM: number} {
  const meanLat = toRadians((startLat + endLat) / 2);
  const kx = EARTH_RADIUS_M * Math.cos(meanLat) * (Math.PI / 180);
  const ky = EARTH_RADIUS_M * (Math.PI / 180);
  const ax = (longitude - startLon) * kx;
  const ay = (latitude - startLat) * ky;
  const bx = (endLon - startLon) * kx;
  const by = (endLat - startLat) * ky;
  const lengthSq = bx * bx + by * by;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, (ax * bx + ay * by) / lengthSq));
  const snappedLon = startLon + ((endLon - startLon) * t);
  const snappedLat = startLat + ((endLat - startLat) * t);
  return {
    latitude: snappedLat,
    longitude: snappedLon,
    distanceM: haversineMeters(latitude, longitude, snappedLat, snappedLon),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
