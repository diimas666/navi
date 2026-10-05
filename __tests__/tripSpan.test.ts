import {tripInSpan} from '../src/services/trips/tripSpan';

const now = new Date(2026, 9, 2, 15, 0, 0).getTime();

test('today keeps trips since local midnight', () => {
  expect(tripInSpan(new Date(2026, 9, 2, 1).getTime(), 'today', now)).toBe(true);
  expect(tripInSpan(new Date(2026, 9, 1, 23).getTime(), 'today', now)).toBe(false);
});

test('week starts Monday and month starts on the first', () => {
  expect(tripInSpan(new Date(2026, 8, 28, 10).getTime(), 'week', now)).toBe(true);
  expect(tripInSpan(new Date(2026, 8, 27, 10).getTime(), 'week', now)).toBe(false);
  expect(tripInSpan(new Date(2026, 9, 1, 0).getTime(), 'month', now)).toBe(true);
  expect(tripInSpan(new Date(2026, 8, 30, 12).getTime(), 'month', now)).toBe(false);
  expect(tripInSpan(new Date(2025, 0, 1).getTime(), 'all', now)).toBe(true);
});
