import {projectOntoSegment} from '../../utils/geo';
import type {RoadGraph} from './RoadGraph';

export type RoadMatch = {
  roadName: string;
  crossTrackM: number;
  applied: boolean;
  latitude: number;
  longitude: number;
};

export function matchToRoad(
  graph: RoadGraph,
  latitude: number,
  longitude: number,
  accuracyM: number,
  confidence: number,
): RoadMatch | null {
  let best: RoadMatch | null = null;
  for (const edge of graph.edgesNear(latitude, longitude)) {
    for (let index = 1; index < edge.coordinates.length; index += 1) {
      const [startLon, startLat] = edge.coordinates[index - 1];
      const [endLon, endLat] = edge.coordinates[index];
      const projected = projectOntoSegment(
        latitude,
        longitude,
        startLat,
        startLon,
        endLat,
        endLon,
      );
      if (!best || projected.distanceM < best.crossTrackM) {
        best = {
          roadName: edge.name,
          crossTrackM: projected.distanceM,
          applied: false,
          latitude: projected.latitude,
          longitude: projected.longitude,
        };
      }
    }
  }
  if (!best) {
    return null;
  }
  const limit = Math.min(40, Math.max(12, accuracyM));
  const canSnap = confidence >= 0.55 && best.crossTrackM <= limit;
  if (!canSnap) {
    return {...best, latitude, longitude, applied: false};
  }
  const pull = Math.min(0.85, confidence) * (1 - best.crossTrackM / limit);
  return {
    ...best,
    applied: true,
    latitude: latitude + (best.latitude - latitude) * pull,
    longitude: longitude + (best.longitude - longitude) * pull,
  };
}
