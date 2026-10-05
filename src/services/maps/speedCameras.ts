import camerasFile from '../../assets/cameras/speed-cameras.json';
import {bearingDegrees, haversineMeters} from '../../utils/geo';

type CameraFile = {
  updated: string;
  cameras: Array<{lat: number; lon: number}>;
};

const file = camerasFile as CameraFile;

export const cameraDatabase = {
  updated: file.updated,
  count: file.cameras.length,
};

export const cameraFeatures = {
  type: 'FeatureCollection' as const,
  features: file.cameras.map(camera => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {type: 'Point' as const, coordinates: [camera.lon, camera.lat]},
  })),
};

export function cameraAheadMeters(
  latitude: number,
  longitude: number,
  heading: number,
): number | null {
  let nearest: number | null = null;
  file.cameras.forEach(camera => {
    const meters = haversineMeters(latitude, longitude, camera.lat, camera.lon);
    if (meters > 700 || meters < 20) {
      return;
    }
    let diff = Math.abs(bearingDegrees(latitude, longitude, camera.lat, camera.lon) - heading);
    if (diff > 180) {
      diff = 360 - diff;
    }
    if (diff > 40) {
      return;
    }
    if (nearest == null || meters < nearest) {
      nearest = meters;
    }
  });
  return nearest;
}
