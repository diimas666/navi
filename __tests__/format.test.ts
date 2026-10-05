import {formatTravel} from '../src/utils/format';

test('travel time keeps short trips in minutes', () => {
  expect(formatTravel(12 * 60, 'год', 'хв')).toBe('12 хв');
});

test('travel time splits hours and the remaining minutes', () => {
  expect(formatTravel(345 * 60, 'год', 'хв')).toBe('5 год 45 хв');
  expect(formatTravel(120 * 60, 'ч', 'мин')).toBe('2 ч');
});
