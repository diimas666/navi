import {geometryStartsNear, placeFix, resetPlaceFix} from '../src/services/navigation/placeFix';

test('simulator San Francisco stands in for Odesa', () => {
  resetPlaceFix();
  const stood = placeFix(37.785834, -122.406417);
  expect(stood.replaced).toBe(true);
  expect(stood.latitude).toBeCloseTo(46.4825, 3);
  expect(stood.longitude).toBeCloseTo(30.7233, 3);
  const drifted = placeFix(37.79, -122.41);
  expect(drifted.replaced).toBe(true);
  expect(drifted.latitude).toBeCloseTo(46.4825, 3);
});

test('a chosen simulator location is left alone', () => {
  resetPlaceFix();
  placeFix(37.785834, -122.406417);
  const custom = placeFix(46.47, 30.74);
  expect(custom.replaced).toBe(false);
  expect(custom.latitude).toBeCloseTo(46.47, 3);
});

test('a street route snapped to another country is dropped', () => {
  const lisbonToOdesa: Array<[number, number]> = [
    [-9.497727, 38.78069],
    [30.7233, 46.4825],
  ];
  expect(geometryStartsNear(lisbonToOdesa, 37.785834, -122.406417)).toBe(false);
  expect(geometryStartsNear(lisbonToOdesa, 46.4825, 30.7233)).toBe(false);
  expect(
    geometryStartsNear(
      [
        [30.73, 46.48],
        [30.75, 46.49],
      ],
      46.4825,
      30.7233,
    ),
  ).toBe(true);
});
