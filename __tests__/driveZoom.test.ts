import {zoomFor} from '../src/services/maps/driveZoom';

test('standing still or walking does not change zoom', () => {
  expect(zoomFor(16, 0)).toBe(16);
  expect(zoomFor(16, 1.5)).toBe(16);
  expect(zoomFor(16, 5)).toBe(16);
});

test('a waving phone heading is ignored because zoom has no turn term', () => {
  expect(zoomFor(16, 0)).toBe(zoomFor(16, 0.4));
});

test('highway speed pulls the camera back in stable steps', () => {
  const city = zoomFor(16, 14);
  const highway = zoomFor(16, 28);
  expect(city).toBeLessThan(16);
  expect(highway).toBeLessThan(city);
  expect(zoomFor(16, 28)).toBe(zoomFor(16, 28.2));
});
