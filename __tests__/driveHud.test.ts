import {highwayLimitKmh, parseMaxspeed, speedLimitKmh} from '../src/services/navigation/speedLimit';
import {rankAlong, sampleAlong} from '../src/services/navigation/alongRoute';
import {joinPlans} from '../src/services/navigation/joinPlans';
import {nextCues} from '../src/services/navigation/maneuver';
import {isNightAt} from '../src/services/maps/sun';
import type {AlongPlace} from '../src/services/navigation/alongRoute';
import type {RoutePlan} from '../src/models/domain';

test('Ukraine highway classes map to posted defaults', () => {
  expect(highwayLimitKmh('motorway')).toBe(130);
  expect(highwayLimitKmh('residential')).toBe(50);
  expect(highwayLimitKmh('living_street')).toBe(20);
  expect(parseMaxspeed('50')).toBe(50);
  expect(parseMaxspeed('none')).toBeNull();
});

test('a step with maxspeed wins when the car is on that turn', () => {
  const route: RoutePlan = {
    distanceM: 400,
    durationS: 40,
    coordinates: [
      [30.72, 46.48],
      [30.73, 46.48],
    ],
    steps: [{name: 'Торгова', distanceM: 400, alongM: 0, latitude: 46.48, longitude: 30.72, speedKmh: 50, kind: 'depart'}],
  };
  expect(speedLimitKmh(46.48, 30.72, route)).toBe(50);
});

test('along-route samples skip the start and keep the end', () => {
  const line: Array<[number, number]> = [
    [30.7, 46.48],
    [30.73, 46.48],
    [30.76, 46.48],
    [30.8, 46.48],
  ];
  const samples = sampleAlong(line, 2000, 4);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples[samples.length - 1]?.longitude).toBeCloseTo(30.8, 3);
});

test('a place far from the remaining line is dropped', () => {
  const route: RoutePlan = {
    distanceM: 2000,
    durationS: 120,
    coordinates: [
      [30.72, 46.48],
      [30.74, 46.48],
    ],
    steps: [],
  };
  const far: AlongPlace = {
    id: 'x',
    name: 'Far',
    kind: 'gas',
    latitude: 46.6,
    longitude: 30.72,
    extraM: 0,
  };
  const near: AlongPlace = {
    id: 'y',
    name: 'Near',
    kind: 'gas',
    latitude: 46.481,
    longitude: 30.73,
    extraM: 0,
  };
  const ranked = rankAlong(route, [far, near]);
  expect(ranked.map(item => item.id)).toEqual(['y']);
});

test('via legs are concatenated without dropping the second name', () => {
  const first: RoutePlan = {
    distanceM: 100,
    durationS: 10,
    coordinates: [
      [30.72, 46.48],
      [30.73, 46.48],
    ],
    steps: [{name: 'A', distanceM: 100, alongM: 0, kind: 'depart'}],
  };
  const second: RoutePlan = {
    distanceM: 80,
    durationS: 8,
    coordinates: [
      [30.73, 46.48],
      [30.74, 46.48],
    ],
    steps: [{name: 'B', distanceM: 80, alongM: 0, kind: 'arrive'}],
  };
  const joined = joinPlans([first, second]);
  expect(joined?.distanceM).toBe(180);
  expect(joined?.steps[1]?.alongM).toBe(100);
  expect(joined?.coordinates).toHaveLength(3);
});

test('the second turn is kept behind the first', () => {
  const route: RoutePlan = {
    distanceM: 900,
    durationS: 90,
    coordinates: [
      [30.72, 46.48],
      [30.73, 46.48],
      [30.74, 46.48],
    ],
    steps: [
      {name: '', distanceM: 100, alongM: 0, kind: 'depart'},
      {name: 'Торгова', distanceM: 300, alongM: 200, kind: 'turn', modifier: 'right'},
      {name: 'Дерибасівська', distanceM: 400, alongM: 500, kind: 'turn', modifier: 'left'},
    ],
  };
  const pair = nextCues(route, 46.48, 30.72, 'uk');
  expect(pair.current.title.toLowerCase()).toContain('торгова');
  expect(pair.after?.title.toLowerCase()).toContain('дерибасівська');
});

test('a roundabout keeps the exit number', () => {
  const route: RoutePlan = {
    distanceM: 400,
    durationS: 40,
    coordinates: [
      [30.72, 46.48],
      [30.73, 46.48],
    ],
    steps: [
      {name: '', distanceM: 40, alongM: 0, kind: 'depart'},
      {name: 'Кільцева', distanceM: 80, alongM: 80, kind: 'roundabout', exit: 2},
    ],
  };
  const pair = nextCues(route, 46.48, 30.72, 'uk');
  expect(pair.current.title).toContain('2-й');
});

test('Odesa in January night is dark, noon in June is not', () => {
  expect(isNightAt(46.48, 30.73, new Date('2026-01-15T22:00:00Z'))).toBe(true);
  expect(isNightAt(46.48, 30.73, new Date('2026-06-15T10:00:00Z'))).toBe(false);
});
