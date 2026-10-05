import {dropPassedStops, isAirLine, keepDistinctRoutes} from '../src/services/navigation/routeChoice';
import type {RoutePlan} from '../src/models/domain';

function line(lat: number, lonStart: number, lonEnd: number, distanceM: number): RoutePlan {
  const coordinates: Array<[number, number]> = [];
  const steps = 40;
  for (let index = 0; index <= steps; index += 1) {
    const lon = lonStart + ((lonEnd - lonStart) * index) / steps;
    coordinates.push([lon, lat]);
  }
  return {distanceM, durationS: distanceM / 20, steps: [], coordinates};
}

test('a second line on the same road is dropped', () => {
  const main = line(50, 30, 32, 140000);
  const sameRoad = line(50.01, 30, 32, 142000);
  expect(keepDistinctRoutes([main, sameRoad])).toHaveLength(1);
});

test('a road that leaves the corridor for a long stretch stays', () => {
  const main = line(50, 30, 33, 200000);
  const other = line(50, 30, 33, 210000);
  other.coordinates = other.coordinates.map(([lon, lat], index) => {
    const shifted = index > 8 && index < 28 ? lat + 0.12 : lat;
    return [lon, shifted];
  });
  expect(keepDistinctRoutes([main, other])).toHaveLength(2);
});

test('a 4.5 km two-point line is treated as flying through houses', () => {
  const air: RoutePlan = {
    distanceM: 4500,
    durationS: 360,
    steps: [],
    coordinates: [
      [30.72, 46.48],
      [30.72, 46.52],
    ],
  };
  const street = line(46.48, 30.72, 30.78, 5200);
  expect(isAirLine(air)).toBe(true);
  expect(isAirLine(street)).toBe(false);
});

test('a passed gas stop is dropped from the rest of the trip', () => {
  const gas = {latitude: 46.48, longitude: 30.73};
  const later = {latitude: 46.5, longitude: 30.8};
  expect(dropPassedStops([gas, later], 46.4801, 30.7301)).toEqual([later]);
  expect(dropPassedStops([gas, later], 46.4, 30.7)).toEqual([gas, later]);
});
