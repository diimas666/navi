import {distanceToRoute, shouldRebuild} from '../src/services/navigation/offRoute';
import {searchPlaces} from '../src/services/maps/Geocoder';
import {planRoute} from '../src/services/roads/Router';
import {RoadGraph} from '../src/services/roads/RoadGraph';
import {parseOverpass, setRegionNetworks, waysToNetwork} from '../src/services/roads/RegionGraph';

test('distance to a straight route is the perpendicular gap', () => {
  const line: Array<[number, number]> = [
    [30.5, 50.45],
    [30.52, 50.45],
  ];
  const away = distanceToRoute(line, 50.4509, 30.51);
  expect(away).toBeGreaterThan(70);
  expect(away).toBeLessThan(150);
});

test('reroute after leaving the line does not wait for a fake phone speed', () => {
  expect(shouldRebuild(80, 8, 21_000)).toBe(true);
  expect(shouldRebuild(20, 8, 21_000)).toBe(false);
  expect(shouldRebuild(80, 0, 21_000)).toBe(true);
  expect(shouldRebuild(80, 8, 1000)).toBe(false);
});

test('downloaded streets connect at a shared corner', () => {
  const network = waysToNetwork([
    {
      id: 'a',
      name: 'Дерибасівська',
      highway: 'secondary',
      coordinates: [
        [30.5, 50.45],
        [30.51, 50.45],
      ],
    },
    {
      id: 'b',
      name: 'Пушкінська',
      highway: 'tertiary',
      coordinates: [
        [30.51, 50.45],
        [30.51, 50.46],
      ],
    },
  ]);
  const route = planRoute(new RoadGraph(network), 50.45, 30.5, 50.46, 30.51);
  expect(route).not.toBeNull();
  expect(route?.steps.map(step => step.name)).toEqual(['Дерибасівська', 'Пушкінська']);
});

test('overpass ways become searchable street names', () => {
  const ways = parseOverpass({
    elements: [
      {
        type: 'way',
        id: 7,
        tags: {name: 'Дерибасівська', highway: 'secondary'},
        geometry: [
          {lat: 46.48, lon: 30.73},
          {lat: 46.481, lon: 30.731},
        ],
      },
    ],
  });
  setRegionNetworks([waysToNetwork(ways)]);
  expect(searchPlaces('дерибасівська').some(place => place.name === 'Дерибасівська')).toBe(true);
  expect(searchPlaces('киев').some(place => place.name === 'Київ')).toBe(true);
  setRegionNetworks([]);
});
