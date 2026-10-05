import {driveBearing, driveFocal, drivePadding, glideDuration, pointAlongMeters} from '../src/services/maps/cameraPull';
import {bearingDegrees, destinationPoint, haversineMeters} from '../src/utils/geo';

test('the drive frame keeps the car in the lower third', () => {
  const height = 800;
  const pad = drivePadding(height);
  const focal = driveFocal(height);
  expect(focal).toBeGreaterThan(height * 0.6);
  expect(focal).toBeLessThan(height * 0.75);
  expect(pad.top).toBeGreaterThan(pad.bottom);
});

test('glide duration stays in a short pull', () => {
  expect(glideDuration(0)).toBe(360);
  expect(glideDuration(100)).toBe(200);
  expect(glideDuration(400)).toBe(460);
  expect(glideDuration(5000)).toBe(900);
});

test('a point ahead follows the road around a corner', () => {
  const start = {latitude: 50.45, longitude: 30.52};
  const east = destinationPoint(start.latitude, start.longitude, 40, 90);
  const north = destinationPoint(east.latitude, east.longitude, 80, 0);
  const line: Array<[number, number]> = [
    [start.longitude, start.latitude],
    [east.longitude, east.latitude],
    [north.longitude, north.latitude],
  ];
  const ahead = pointAlongMeters(line, start.latitude, start.longitude, 70);
  expect(ahead).not.toBeNull();
  if (!ahead) {
    return;
  }
  const fromCorner = haversineMeters(east.latitude, east.longitude, ahead.latitude, ahead.longitude);
  expect(fromCorner).toBeGreaterThan(20);
  expect(fromCorner).toBeLessThan(40);
  const course = bearingDegrees(east.latitude, east.longitude, ahead.latitude, ahead.longitude);
  expect(course).toBeLessThan(20);
});

test('the map turns into the next street', () => {
  const start = {latitude: 50.45, longitude: 30.52};
  const east = destinationPoint(start.latitude, start.longitude, 30, 90);
  const north = destinationPoint(east.latitude, east.longitude, 80, 0);
  const line: Array<[number, number]> = [
    [start.longitude, start.latitude],
    [east.longitude, east.latitude],
    [north.longitude, north.latitude],
  ];
  const course = driveBearing(line, start.latitude, start.longitude, 90, 12);
  expect(course).toBeGreaterThan(20);
  expect(course).toBeLessThan(70);
});
