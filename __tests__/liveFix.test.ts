import {liveFixQuiet} from '../src/services/navigation/liveFix';
import type {NativeSnapshot} from '../src/native/NativeTripSession';

function snapshot(over: Partial<NativeSnapshot> = {}): NativeSnapshot {
  return {
    navigationActive: false,
    drAllowed: true,
    trust: 'trusted',
    trustReason: '',
    hasGps: true,
    gpsLatitude: 46.48,
    gpsLongitude: 30.73,
    gpsAccuracy: 8,
    gpsSpeed: 12,
    gpsHeading: 90,
    hasEstimate: true,
    latitude: 46.48,
    longitude: 30.73,
    heading: 90,
    accuracy: 8,
    confidence: 1,
    distanceSinceGPS: 0,
    timeSinceGPS: 0,
    source: 'gps',
    hasSpeed: true,
    speedMps: 12,
    speedSource: 'gps',
    motionQuality: 'good',
    obdQuality: '',
    timestamp: 1,
    ...over,
  };
}

test('a jitter under 1.5 m does not wake the map', () => {
  const prior = snapshot();
  expect(
    liveFixQuiet(
      {
        snapshot: prior,
        displayLatitude: 46.48,
        displayLongitude: 30.73,
        roadName: 'Дерибасівська',
        roadApplied: true,
        crossTrackM: 2,
      },
      snapshot({timestamp: 2, latitude: 46.480004, longitude: 30.73}),
      46.480004,
      30.73,
      'Дерибасівська',
      true,
      2,
    ),
  ).toBe(true);
});

test('a km/h change or a turn wakes the map', () => {
  const prior = snapshot();
  const state = {
    snapshot: prior,
    displayLatitude: 46.48,
    displayLongitude: 30.73,
    roadName: null as string | null,
    roadApplied: false,
    crossTrackM: null as number | null,
  };
  expect(liveFixQuiet(state, snapshot({speedMps: 13}), 46.48, 30.73, null, false, null)).toBe(false);
  expect(liveFixQuiet(state, snapshot({heading: 94}), 46.48, 30.73, null, false, null)).toBe(false);
});
