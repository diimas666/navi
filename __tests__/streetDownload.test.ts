import {REGIONS} from '../src/constants/map';
import {
  highwayFilter,
  parseOverpass,
  shouldSplitStreetTile,
  streetTileIncludesService,
} from '../src/services/roads/RegionGraph';

const odesa = REGIONS.find(region => region.id === 'odesa');

test('large Odesa tiles drop service roads so Overpass can finish', () => {
  expect(odesa).toBeDefined();
  expect(streetTileIncludesService(0.05)).toBe(false);
  expect(highwayFilter(odesa!, false)).not.toContain('service');
  expect(highwayFilter(odesa!, false)).toContain('residential');
});

test('split tiles keep service alleys', () => {
  expect(streetTileIncludesService(0.008)).toBe(true);
  expect(streetTileIncludesService(0.007)).toBe(true);
  expect(highwayFilter(odesa!, true)).toContain('|service');
});

test('a hung or oversized tile is split instead of retrying every mirror', () => {
  expect(shouldSplitStreetTile(new Error('payload too big'))).toBe(true);
  expect(shouldSplitStreetTile(new Error('payload timeout'))).toBe(true);
  expect(shouldSplitStreetTile(new Error('street tile incomplete'))).toBe(true);
  const aborted = new Error('Aborted');
  aborted.name = 'AbortError';
  expect(shouldSplitStreetTile(aborted)).toBe(true);
  expect(shouldSplitStreetTile(new Error('streets 429'))).toBe(false);
});

test('blocked ways do not enter the street graph', () => {
  const ways = parseOverpass({
    elements: [
      {
        type: 'way',
        id: 1,
        tags: {name: 'Закрита', highway: 'service', access: 'no'},
        geometry: [
          {lat: 46.48, lon: 30.73},
          {lat: 46.481, lon: 30.731},
        ],
      },
      {
        type: 'way',
        id: 2,
        tags: {name: 'Відкрита', highway: 'residential'},
        geometry: [
          {lat: 46.48, lon: 30.73},
          {lat: 46.482, lon: 30.732},
        ],
      },
    ],
  });
  expect(ways.map(way => way.name)).toEqual(['Відкрита']);
});
