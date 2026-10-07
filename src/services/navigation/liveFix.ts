import type {NativeSnapshot} from '../../native/NativeTripSession';
import {haversineMeters} from '../../utils/geo';

type LiveState = {
  snapshot: NativeSnapshot | null;
  displayLatitude: number | null;
  displayLongitude: number | null;
  roadName: string | null;
  roadApplied: boolean;
  crossTrackM: number | null;
};

export function liveFixQuiet(
  previous: LiveState,
  snapshot: NativeSnapshot,
  latitude: number,
  longitude: number,
  roadName: string | null,
  applied: boolean,
  crossTrackM: number | null,
): boolean {
  if (previous.displayLatitude == null || previous.displayLongitude == null) {
    return false;
  }
  const prior = previous.snapshot;
  if (!prior) {
    return false;
  }
  if (haversineMeters(previous.displayLatitude, previous.displayLongitude, latitude, longitude) > 1.5) {
    return false;
  }
  if (Math.round(prior.heading) !== Math.round(snapshot.heading)) {
    return false;
  }
  if (Math.round(prior.speedMps * 3.6) !== Math.round(snapshot.speedMps * 3.6)) {
    return false;
  }
  if (prior.trust !== snapshot.trust || prior.source !== snapshot.source) {
    return false;
  }
  if (prior.hasGps !== snapshot.hasGps || prior.hasEstimate !== snapshot.hasEstimate) {
    return false;
  }
  if (prior.hasSpeed !== snapshot.hasSpeed || prior.navigationActive !== snapshot.navigationActive) {
    return false;
  }
  if (previous.roadName !== roadName || previous.roadApplied !== applied) {
    return false;
  }
  if (Math.round(previous.crossTrackM ?? 0) !== Math.round(crossTrackM ?? 0)) {
    return false;
  }
  if (Math.round(prior.gpsAccuracy) !== Math.round(snapshot.gpsAccuracy)) {
    return false;
  }
  if (Math.round(prior.accuracy) !== Math.round(snapshot.accuracy)) {
    return false;
  }
  return true;
}
