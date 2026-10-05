import {parseAddressPayload, replaceHouses, searchDownloadedHouses, splitBounds, boundsArea} from '../src/services/maps/houses';
import {searchPlaces} from '../src/services/maps/Geocoder';

test('every explicit house number is kept', () => {
  const elements = Array.from({length: 30}, (_, index) => ({
    type: 'node',
    id: index + 1,
    lat: 46.48 + index * 0.0001,
    lon: 30.73,
    tags: {
      'addr:street': 'Дерибасівська',
      'addr:housenumber': String(index + 1),
      'addr:city': 'Одеса',
    },
  }));
  const houses = parseAddressPayload({elements});
  expect(houses).toHaveLength(30);
  expect(houses.map(house => house.house)).toEqual(elements.map((_, index) => String(index + 1)));
});

test('interpolation fills every number between the mapped ends', () => {
  const houses = parseAddressPayload({
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 46.4,
        lon: 30.7,
        tags: {'addr:street': 'Пушкінська', 'addr:housenumber': '2'},
      },
      {
        type: 'node',
        id: 2,
        lat: 46.4,
        lon: 30.704,
        tags: {'addr:street': 'Пушкінська', 'addr:housenumber': '8'},
      },
      {
        type: 'way',
        id: 9,
        nodes: [1, 2],
        tags: {'addr:interpolation': 'all', 'addr:street': 'Пушкінська'},
      },
    ],
  });
  expect(houses.map(house => house.house).sort()).toEqual(['2', '3', '4', '5', '6', '7', '8']);
});

test('split tiles cover the region without overlap', () => {
  const region = {west: 30.2, south: 50.2, east: 30.9, north: 50.6};
  const parts = splitBounds(region);
  const covered = parts.reduce((sum, part) => sum + boundsArea(part), 0);
  expect(Math.abs(covered - boundsArea(region))).toBeLessThan(1e-9);
  expect(parts).toHaveLength(4);
});

test('downloaded house search returns that exact address', () => {
  replaceHouses([
    {street: 'Дерибасівська', house: '10', city: 'Одеса', latitude: 46.484, longitude: 30.732},
    {street: 'Дерибасівська', house: '12', city: 'Одеса', latitude: 46.485, longitude: 30.733},
  ]);
  const found = searchDownloadedHouses('Дерибасівська 10');
  expect(found).toHaveLength(1);
  expect(found[0]?.latitude).toBe(46.484);
  expect(searchPlaces('Дерибасівська 10')[0]?.kind).toBe('house');
  expect(searchPlaces('киев').some(place => place.name === 'Київ')).toBe(true);
  replaceHouses([]);
});
