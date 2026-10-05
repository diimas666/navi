import {accuracyFeature} from './AccuracyCircle';

export function uncertaintyFeature(
  latitude: number,
  longitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return accuracyFeature(latitude, longitude, radiusM);
}
