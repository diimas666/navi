import {pointAlong, pullRouteDr, startRouteDr, stepRouteDr} from '../src/services/navigation/routeDr';
import {destinationPoint, haversineMeters} from '../src/utils/geo';

// A route east for 1 km, then north for 1 km.
const corner = destinationPoint(50, 30, 1000, 90);
const end = destinationPoint(corner.latitude, corner.longitude, 1000, 0);
const route: Array<[number, number]> = [
  [30, 50],
  [corner.longitude, corner.latitude],
  [end.longitude, end.latitude],
];

test('point along walks the route by distance', () => {
  const half = pointAlong(route, 1500);
  const expected = destinationPoint(corner.latitude, corner.longitude, 500, 0);
  expect(haversineMeters(half.latitude, half.longitude, expected.latitude, expected.longitude)).toBeLessThan(2);
});

test('drifting heading still turns the corner with the route', () => {
  // The free estimate drifts 10° to the right of the true course.
  let free = {latitude: 50, longitude: 30};
  let state = startRouteDr(0, free);
  let shown = free;
  for (let step = 1; step <= 120; step += 1) {
    const heading = step * 10 <= 1000 ? 100 : 10;
    free = destinationPoint(free.latitude, free.longitude, 10, heading);
    // Uncertainty grows with distance like DeadReckoningEngine: base, distance and heading slack.
    const next = stepRouteDr(state, route, free, 20 + step * 2.5);
    state = next.state;
    shown = next.point ?? free;
  }
  const truth = pointAlong(route, 1200);
  expect(state.left).toBe(false);
  expect(haversineMeters(shown.latitude, shown.longitude, truth.latitude, truth.longitude)).toBeLessThan(5);
  expect(haversineMeters(free.latitude, free.longitude, truth.latitude, truth.longitude)).toBeGreaterThan(100);
});

test('turning away from the route stops snapping', () => {
  let free = {latitude: 50, longitude: 30};
  let state = startRouteDr(0, free);
  for (let step = 1; step <= 60; step += 1) {
    free = destinationPoint(free.latitude, free.longitude, 10, step <= 30 ? 90 : 180);
    state = stepRouteDr(state, route, free, 30).state;
  }
  expect(state.left).toBe(true);
});

test('a network fix far ahead moves the progress forward', () => {
  // Without OBD the estimate stood in the yard while the car drove 1.6 km along the route.
  const yard = {latitude: 50, longitude: 30};
  const state = startRouteDr(0, yard);
  const pulled = destinationPoint(corner.latitude, corner.longitude, 600, 0);
  const next = pullRouteDr(state, 1600, pulled, 400);
  expect(next.alongM).toBe(1600);
  expect(next.left).toBe(false);
  const shown = stepRouteDr(next, route, pulled, 400).point;
  expect(shown).not.toBeNull();
  const truth = pointAlong(route, 1600);
  expect(haversineMeters(shown!.latitude, shown!.longitude, truth.latitude, truth.longitude)).toBeLessThan(5);
});

test('a small step back from a network fix keeps the progress', () => {
  const state = {alongM: 1500, lastLatitude: 50, lastLongitude: 30, left: true};
  const next = pullRouteDr(state, 1300, {latitude: 50, longitude: 30}, 500);
  expect(next.alongM).toBe(1500);
  expect(next.left).toBe(false);
});
