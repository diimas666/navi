import {circlePolygon} from '../utils/geo';

export function accuracyFeature(
  latitude: number,
  longitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: circlePolygon(latitude, longitude, Math.max(radiusM, 4)),
  };
}
