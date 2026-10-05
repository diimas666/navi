import {searchEmptyHint, searchLiveHint, searchScope} from '../src/services/maps/searchScope';
import {regionIsStale} from '../src/services/maps/regionCoverage';
import {useMapStore} from '../src/store/mapStore';

const copy = {
  searchEmpty: 'empty',
  searchEmptyRegion: 'У скачаній {region} такої адреси немає.',
  searchInRegion: 'Шукаємо в скачаній {region}',
  searchNeedNet: 'Потрібна мережа. Область не скачана.',
};

beforeEach(() => {
  useMapStore.setState({regions: {}, online: false, linkKnown: true});
});

test('offline in a downloaded city names that region', () => {
  useMapStore.getState().patchRegion('kyiv', {status: 'downloaded'});
  const scope = searchScope(50.45, 30.52, false);
  expect(scope.coveringName).toContain('Київ');
  expect(searchLiveHint(scope, copy)).toContain('Київ');
  expect(searchEmptyHint(scope, copy)).toContain('Київ');
});

test('offline outside a downloaded map asks for network', () => {
  const scope = searchScope(50.45, 30.52, false);
  expect(scope.needsNetwork).toBe(true);
  expect(searchEmptyHint(scope, copy)).toBe(copy.searchNeedNet);
});

test('a two-week-old map is stale, a fresh one is not', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  expect(regionIsStale(now - 15 * 24 * 60 * 60 * 1000, now)).toBe(true);
  expect(regionIsStale(now - 2 * 24 * 60 * 60 * 1000, now)).toBe(false);
  expect(regionIsStale(null, now)).toBe(false);
});
