import {settleMarker} from '../src/services/navigation/markerSettle';
import {destinationPoint, haversineMeters} from '../src/utils/geo';

const home = {latitude: 50.45, longitude: 30.52};

function ahead(meters: number, heading = 90): {latitude: number; longitude: number} {
  return destinationPoint(home.latitude, home.longitude, meters, heading);
}

function step(from: {latitude: number; longitude: number} | null, to: {latitude: number; longitude: number}, gapS: number, speedMps: number, trustFix: boolean) {
  return settleMarker({
    fromLatitude: from?.latitude ?? null,
    fromLongitude: from?.longitude ?? null,
    latitude: to.latitude,
    longitude: to.longitude,
    gapS,
    speedMps,
    trustFix,
  });
}

test('the first fix is shown as it is', () => {
  const fix = ahead(40);
  const shown = step(null, fix, 0, 0, true);
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
});

test('with internet the marker follows a normal GPS track', () => {
  let shown = home;
  for (let second = 1; second <= 8; second += 1) {
    const fix = ahead(15 * second);
    shown = step(shown, fix, 1, 15, true);
    expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
  }
});

test('unlock with no accumulated error keeps the fix', () => {
  const fix = ahead(12);
  const shown = step(home, fix, 40, 0, true);
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
});

test('unlock after a drifted estimate does not jump', () => {
  const fix = ahead(150);
  const shown = step(home, fix, 45, 12, true);
  const moved = haversineMeters(home.latitude, home.longitude, shown.latitude, shown.longitude);
  const left = haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude);
  expect(moved).toBeLessThanOrEqual(16.5);
  expect(left).toBeGreaterThan(100);
});

test('after unlock the drifted marker rejoins and then stays on the fix', () => {
  const fix = ahead(150);
  let shown = home;
  for (let second = 0; second < 12; second += 1) {
    const before = haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude);
    shown = step(shown, fix, 1, 12, true);
    const moved = before - haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude);
    expect(moved).toBeLessThanOrEqual(50);
  }
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(4);
  shown = step(shown, fix, 1, 12, true);
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
});

test('offline dead reckoning still follows the car', () => {
  let shown = home;
  for (let second = 1; second <= 5; second += 1) {
    const fix = ahead(20 * second);
    shown = step(shown, fix, 1, 20, false);
    expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
  }
});

test('internet returning after an offline error glides instead of snapping', () => {
  const drifted = ahead(220);
  let shown = home;
  const first = step(shown, drifted, 0.4, 14, true);
  expect(haversineMeters(home.latitude, home.longitude, first.latitude, first.longitude)).toBeLessThanOrEqual(16.5);
  shown = first;
  for (let tick = 0; tick < 20; tick += 1) {
    shown = step(shown, drifted, 1, 14, true);
  }
  expect(haversineMeters(shown.latitude, shown.longitude, drifted.latitude, drifted.longitude)).toBeLessThan(4);
});

test('a single bad GPS spike while online does not teleport the marker', () => {
  const spike = ahead(400);
  const shown = step(home, spike, 1, 14, true);
  expect(haversineMeters(home.latitude, home.longitude, shown.latitude, shown.longitude)).toBeLessThanOrEqual(16.5);
});

test('parking-scale noise does not move the marker', () => {
  const fix = ahead(0.2);
  const shown = step(home, fix, 1, 0, true);
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(0.5);
});

test('GPS coordinates moving at car speed follow even when the phone reports 9 km/h', () => {
  const fix = ahead(22);
  const shown = step(home, fix, 1, 2.5, true);
  expect(haversineMeters(shown.latitude, shown.longitude, fix.latitude, fix.longitude)).toBeLessThan(1);
});
