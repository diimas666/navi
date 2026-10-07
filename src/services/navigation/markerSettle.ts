import {bearingDegrees, destinationPoint, haversineMeters} from '../../utils/geo';

const ALIGNED_M = 28;
const REJOIN_MPS = 16;

export type MarkerSettleInput = {
  fromLatitude: number | null;
  fromLongitude: number | null;
  latitude: number;
  longitude: number;
  gapS: number;
  speedMps: number;
  trustFix: boolean;
};

export function settleMarker(input: MarkerSettleInput): {latitude: number; longitude: number} {
  if (input.fromLatitude == null || input.fromLongitude == null) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  const distance = haversineMeters(input.fromLatitude, input.fromLongitude, input.latitude, input.longitude);
  if (distance < 0.4) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  const gap = Math.max(0, input.gapS);
  const implied = gap > 0.05 ? distance / gap : distance / 0.05;
  // Phone GPS speed is often ~9 km/h in a moving car. A normal 1s hop is ~20 m, not 150 m.
  if (gap <= 2.5 && distance <= 50 && implied <= 28) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  const step = Math.min(Math.max(gap, 0.05), 2);
  const live = Math.max(0, input.speedMps) * step + 4;
  if (input.trustFix && gap <= 2.5 && distance <= live) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  if (input.trustFix && gap > 2.5 && distance <= ALIGNED_M) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  if (!input.trustFix && distance <= live) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  const catchup = input.trustFix ? REJOIN_MPS : Math.max(live, REJOIN_MPS);
  const budget = catchup * Math.min(Math.max(gap, 0.05), 1);
  if (distance <= budget) {
    return {latitude: input.latitude, longitude: input.longitude};
  }
  const heading = bearingDegrees(input.fromLatitude, input.fromLongitude, input.latitude, input.longitude);
  return destinationPoint(input.fromLatitude, input.fromLongitude, budget, heading);
}
