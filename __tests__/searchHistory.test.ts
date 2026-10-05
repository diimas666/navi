import {historyFromPlace, matchesHistory, mergeHistory} from '../src/services/search/searchHistory';
import type {Place} from '../src/models/domain';

const army: Place = {
  id: 'a',
  name: 'Армійська 4',
  latitude: 46.47,
  longitude: 30.73,
  kind: 'address',
  detail: 'Одеса',
};

test('a typed address is kept at the top without duplicates', () => {
  const first = historyFromPlace(army);
  expect(first).not.toBeNull();
  if (!first) {
    return;
  }
  const once = mergeHistory([], first);
  const twice = mergeHistory(once, {...first, at: first.at + 10});
  expect(twice).toHaveLength(1);
  expect(twice[0]?.name).toBe('Армійська 4');
});

test('an empty search shows every recent row', () => {
  const row = historyFromPlace(army);
  expect(row && matchesHistory(row, '')).toBe(true);
  expect(row && matchesHistory(row, 'арм')).toBe(true);
  expect(row && matchesHistory(row, 'київ')).toBe(false);
});
