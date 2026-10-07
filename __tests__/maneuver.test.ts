import {nextCue, progressAlong, remainingCoordinates} from '../src/services/navigation/maneuver';
import {shouldRebuild} from '../src/services/navigation/offRoute';
import type {RoutePlan} from '../src/models/domain';

const line: Array<[number, number]> = [
  [30.72, 46.48],
  [30.73, 46.48],
  [30.74, 46.48],
  [30.75, 46.48],
];

const route: RoutePlan = {
  distanceM: 2300,
  durationS: 180,
  via: 'street',
  coordinates: line,
  steps: [
    {name: '', distanceM: 100, alongM: 0, kind: 'depart', latitude: 46.48, longitude: 30.72},
    {name: 'Торгова', distanceM: 400, alongM: 400, kind: 'turn', modifier: 'right', latitude: 46.48, longitude: 30.73},
    {name: 'Дім', distanceM: 0, alongM: 2300, kind: 'arrive', latitude: 46.48, longitude: 30.75},
  ],
};

test('a long leftover line is not announced as arrival', () => {
  const cue = nextCue(route, 46.48, 30.72, 'uk');
  expect(cue.turn).not.toBe('arrive');
  expect(cue.meters).toBeGreaterThan(50);
});

test('arrival is only close to the end', () => {
  const cue = nextCue(route, 46.48, 30.75, 'uk');
  expect(cue.turn).toBe('arrive');
  expect(cue.meters).toBeLessThan(40);
});

test('passed road is dropped from the remaining line', () => {
  const rest = remainingCoordinates(line, 46.48, 30.74);
  expect(rest[0]?.[0]).toBeGreaterThan(30.735);
  expect(rest[rest.length - 1]?.[0]).toBe(30.75);
  expect(progressAlong(line, 46.48, 30.73)).toBeGreaterThan(700);
});

test('progress along a long line stays correct after a hint', () => {
  const long: Array<[number, number]> = Array.from({length: 400}, (_, index) => [30.7 + index * 0.001, 46.48]);
  const early = progressAlong(long, 46.48, 30.72);
  const later = progressAlong(long, 46.48, 30.9);
  expect(later).toBeGreaterThan(early + 10_000);
  expect(progressAlong(long, 46.48, 30.71)).toBeLessThan(later);
});

test('a side street rebuilds without waiting for highway speed', () => {
  expect(shouldRebuild(50, 1.2, 4_000)).toBe(true);
  expect(shouldRebuild(90, 0, 7_000)).toBe(true);
  expect(shouldRebuild(20, 8, 8_000)).toBe(false);
});
