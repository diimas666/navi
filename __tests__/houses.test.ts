import {
  parseAddressPayload,
  replaceHouses,
  housesNear,
  searchDownloadedHouses,
  searchDownloadedStreets,
  searchHousesOnStreet,
  snapPlaceToHouse,
  splitBounds,
  boundsArea,
} from '../src/services/maps/houses';
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

test('a street pin snaps onto the typed house when it is nearby', () => {
  replaceHouses([
    {street: 'Люстдорфська дорога', house: '86', city: 'Одеса', latitude: 46.4249, longitude: 30.7261},
  ]);
  const snapped = snapPlaceToHouse(
    {
      id: 'street',
      name: 'Люстдорфська дорога',
      latitude: 46.4255,
      longitude: 30.7268,
      kind: 'street',
    },
    'Люстдорфська 86',
  );
  expect(snapped.kind).toBe('house');
  expect(snapped.latitude).toBe(46.4249);
  expect(snapped.longitude).toBe(30.7261);
  replaceHouses([]);
});

test('typing the start of a street finds downloaded alleys', () => {
  replaceHouses([
    {street: '1-й Розумовський провулок', house: '4', city: 'Одеса', latitude: 46.471, longitude: 30.721},
    {street: '2-й Розумовський провулок', house: '8', city: 'Одеса', latitude: 46.472, longitude: 30.722},
  ]);
  const streets = searchDownloadedStreets('Розу');
  expect(streets.map(place => place.name)).toEqual([
    '1-й Розумовський провулок',
    '2-й Розумовський провулок',
  ]);
  expect(searchPlaces('Розу')[0]?.name).toContain('Розумовський');
  const houses = searchHousesOnStreet('1-й Розумовський провулок');
  expect(houses[0]?.kind).toBe('house');
  expect(houses[0]?.name).toContain('4');
  replaceHouses([]);
});

test('a house pin moves onto the nearest entrance', () => {
  replaceHouses([
    {street: 'Проїзна', house: '26', city: 'Одеса', latitude: 46.471, longitude: 30.721},
    {street: 'Проїзна', house: '26', city: 'Одеса', latitude: 46.47105, longitude: 30.72112, entrance: '1'},
  ]);
  const snapped = snapPlaceToHouse(
    {
      id: 'house',
      name: 'Проїзна, 26',
      latitude: 46.4712,
      longitude: 30.721,
      kind: 'street',
    },
    'Проїзна 26',
  );
  expect(snapped.latitude).toBe(46.47105);
  expect(snapped.longitude).toBe(30.72112);
  expect(snapped.name).toContain("під'їзд 1");
  replaceHouses([]);
});

test('nearby houses are found across cell edges', () => {
  replaceHouses([
    {street: 'Приморська', house: '1', city: 'Одеса', latitude: 46.48, longitude: 30.74},
    {street: 'Приморська', house: '200', city: 'Одеса', latitude: 46.6, longitude: 30.9},
  ]);
  const found = housesNear(46.499, 30.759, 0.02);
  expect(found.map(house => house.house)).toEqual(['1']);
  replaceHouses([]);
});

test('an entrance node without a street joins the nearest house', () => {
  const houses = parseAddressPayload({
    elements: [
      {
        type: 'way',
        id: 1,
        lat: 46.47,
        lon: 30.72,
        center: {lat: 46.47, lon: 30.72},
        tags: {'addr:street': 'Проїзна', 'addr:housenumber': '26', 'addr:city': 'Одеса'},
      },
      {
        type: 'node',
        id: 2,
        lat: 46.4701,
        lon: 30.7201,
        tags: {entrance: 'main'},
      },
    ],
  });
  expect(houses.some(house => house.entrance === 'main' && house.house === '26')).toBe(true);
});
