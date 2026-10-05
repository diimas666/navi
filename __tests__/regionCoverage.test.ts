import {REGIONS} from '../src/constants/map';
import {
  bestRegionAt,
  coverageGapAhead,
  coveringRegion,
  formatRegionList,
  isCovered,
  missingRegionsAlong,
  regionContains,
  regionsAt,
} from '../src/services/maps/regionCoverage';
import {useMapStore} from '../src/store/mapStore';

beforeEach(() => {
  useMapStore.setState({regions: {}});
});

test('Kyiv city sits inside both Kyiv and Kyiv oblast', () => {
  const hits = regionsAt(50.45, 30.52).map(region => region.id);
  expect(hits).toContain('kyiv');
  expect(hits).toContain('kyiv-oblast');
  expect(hits[0]).toBe('kyiv');
});

test('a downloaded city covers a point even when the oblast is missing', () => {
  useMapStore.getState().patchRegion('kyiv', {status: 'downloaded'});
  expect(isCovered(50.45, 30.52)).toBe(true);
  expect(coveringRegion(50.45, 30.52)?.id).toBe('kyiv');
  expect(isCovered(50.45, 31.05)).toBe(false);
});

test('a route from Kyiv to Cherkasy asks for the missing oblast', () => {
  useMapStore.getState().patchRegion('kyiv', {status: 'downloaded'});
  const line: Array<[number, number]> = [
    [30.52, 50.45],
    [31.4, 49.8],
    [32.06, 49.44],
  ];
  const missing = missingRegionsAlong(line).map(region => region.id);
  expect(missing).toContain('cherkasy');
  expect(missing).not.toContain('kyiv');
});

test('leaving a downloaded city warns before the oblast gap', () => {
  useMapStore.getState().patchRegion('kyiv', {status: 'downloaded'});
  const line: Array<[number, number]> = [
    [30.88, 50.45],
    [30.95, 50.45],
  ];
  const gap = coverageGapAhead(50.45, 30.88, line);
  expect(gap).not.toBeNull();
  expect(gap?.meters).toBeGreaterThan(0);
  expect(gap?.meters).toBeLessThan(12_000);
});

test('region list joins two names in Ukrainian', () => {
  expect(formatRegionList(['Київ', 'Черкаська область'], 'uk')).toBe('Київ і Черкаська область');
  expect(formatRegionList(['Киев'], 'ru')).toBe('Киев');
});

test('Odesa bounds contain the city center', () => {
  const odesa = REGIONS.find(region => region.id === 'odesa');
  expect(odesa && regionContains(odesa, 46.48, 30.73)).toBe(true);
});

test('Odesa city is Odesa, not the overlapping Mykolaiv box', () => {
  expect(bestRegionAt(46.48, 30.73)?.id).toBe('odesa');
  expect(regionsAt(46.48, 30.73).map(region => region.id)).toContain('mykolaiv');
  const missing = missingRegionsAlong([
    [30.73, 46.48],
    [30.68, 46.43],
  ]).map(region => region.id);
  expect(missing).toEqual(['odesa']);
});

test('a downloaded Odesa map does not ask for Mykolaiv on a city trip', () => {
  useMapStore.getState().patchRegion('odesa', {status: 'downloaded'});
  expect(
    missingRegionsAlong([
      [30.73, 46.48],
      [30.68, 46.43],
    ]),
  ).toEqual([]);
});
