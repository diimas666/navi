import {highwayMeters, rankRoutes} from '../src/services/navigation/routeChoice';
import type {RoutePlan} from '../src/models/domain';

function plan(patch: Partial<RoutePlan> & {name?: string}): RoutePlan {
  return {
    distanceM: 1000,
    durationS: 120,
    steps: [
      {
        name: patch.name ?? 'Вулиця',
        distanceM: patch.distanceM ?? 1000,
        alongM: 0,
        kind: 'depart',
        speedKmh: patch.steps?.[0]?.speedKmh,
      },
    ],
    coordinates: [
      [30.73, 46.48],
      [30.74, 46.49],
      [30.75, 46.5],
    ],
    via: 'street',
    ...patch,
  };
}

test('shorter wins on distance, faster on time', () => {
  const city = plan({distanceM: 4200, durationS: 520, name: 'Люстдорфська'});
  const ring = plan({distanceM: 6100, durationS: 380, name: 'М-05'});
  expect(rankRoutes([city, ring], 'shorter')[0]).toBe(city);
  expect(rankRoutes([city, ring], 'faster')[0]).toBe(ring);
});

test('no highway prefers streets and never drops the only road', () => {
  const highway = plan({distanceM: 5000, durationS: 300, name: 'М-05 Одеса — Київ', steps: [
    {name: 'М-05 Одеса — Київ', distanceM: 5000, alongM: 0, kind: 'depart', speedKmh: 110},
  ]});
  const street = plan({distanceM: 7200, durationS: 540, name: 'Люстдорфська'});
  expect(highwayMeters(highway)).toBeGreaterThan(4000);
  expect(rankRoutes([highway, street], 'noHighway')[0]).toBe(street);
  expect(rankRoutes([highway], 'noHighway')[0]).toBe(highway);
});
