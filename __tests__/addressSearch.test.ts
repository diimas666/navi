import {orderPlaces, searchPlaces} from '../src/services/maps/Geocoder';
import {matchesStreet, queryVariants} from '../src/services/maps/addressQuery';
import type {Place} from '../src/models/domain';

const odesa: Place = {
  id: 'odesa',
  name: 'Рішельєвська вулиця, 67, Одеса',
  latitude: 46.4704,
  longitude: 30.7392,
  kind: 'house',
};

const kherson: Place = {
  id: 'kherson',
  name: 'Рішельєвська вулиця, 67, Херсон',
  latitude: 46.6404,
  longitude: 32.6064,
  kind: 'house',
};

const fontanka: Place = {
  id: 'fontanka',
  name: 'Ришельєвська вулиця, Фонтанка',
  latitude: 46.5563,
  longitude: 30.8401,
  kind: 'address',
};

test('address search keeps the typed spelling ahead of the folded one', () => {
  expect(queryVariants('Рішельєвська 67')[0]).toBe('Рішельєвська 67');
});

test('address search asks Photon with Ukrainian і when the query used и', () => {
  expect(queryVariants('Ришельвська 45')).toContain('Рішельвська 45');
});

test('a missing vowel still matches the street name', () => {
  expect(matchesStreet('Рішельєвська вулиця', 'Ришельвська 45')).toBe(true);
});

test('russian and ukrainian spellings name the same ukrainian street', () => {
  expect(queryVariants('Дерибасовская 5')).toContain('Дерібасівська 5');
  expect(queryVariants('Проїзна 23')[0]).toBe('Проїзна 23');
  expect(matchesStreet('Дерибасівська вулиця', 'Дерибасовская')).toBe(true);
  expect(matchesStreet('Проїзна вулиця', 'Проездная 23')).toBe(true);
  expect(matchesStreet('Рішельєвська вулиця', 'Ришельевская')).toBe(true);
});

test('russian проездна matches the Odesa street Проїзна', () => {
  expect(queryVariants('Проездна 23')).toContain('Проїзна 23');
  expect(matchesStreet('Проїзна вулиця', 'Проездна 23')).toBe(true);
});

test('address search still returns a house when there is no position', () => {
  const found = orderPlaces([odesa], null, 'Ришельвська 45');
  expect(found.map(place => place.id)).toEqual(['odesa']);
});

test('address search ignores another city when it was not typed', () => {
  const found = orderPlaces([kherson, fontanka, odesa], {latitude: 46.482, longitude: 30.732}, 'Рішельєвська 67');
  expect(found.map(place => place.id)).toEqual(['odesa']);
});

test('a street query lists streets by distance and skips places', () => {
  const near: Place = {
    id: 'near',
    name: 'Рішельєвська вулиця',
    detail: 'Одеса',
    latitude: 46.48,
    longitude: 30.74,
    kind: 'street',
  };
  const far: Place = {
    id: 'far',
    name: 'Рішельєвська вулиця',
    detail: 'Херсон',
    latitude: 46.64,
    longitude: 32.61,
    kind: 'street',
  };
  const monument: Place = {
    id: 'monument',
    name: "Пам'ятник Дюку де Рішельє",
    detail: 'Одеса',
    latitude: 46.488,
    longitude: 30.741,
    kind: 'poi',
  };
  const found = orderPlaces([monument, far, near], {latitude: 46.482, longitude: 30.732}, 'Рішель');
  expect(found.map(place => place.id)).toEqual(['near']);
});

test('address search shows the nearest house when nothing is close', () => {
  const simferopol: Place = {
    id: 'simferopol',
    name: 'Проездная улица, 23',
    detail: 'Симферополь',
    latitude: 44.9591,
    longitude: 34.083,
    kind: 'house',
  };
  const found = orderPlaces([simferopol], {latitude: 46.482, longitude: 30.732}, 'Проездная 23');
  expect(found.map(place => place.id)).toEqual(['simferopol']);
});

test('address search uses the city written in the query', () => {
  const found = orderPlaces(
    [kherson, fontanka, odesa],
    {latitude: 46.482, longitude: 30.732},
    'Рішельєвська 67 Херсон',
  );
  expect(found.map(place => place.id)).toEqual(['kherson']);
});

test('an extra letter still finds the nearby street and not a city', () => {
  expect(queryVariants('Проїздна 23')).toContain('Проїзна 23');
  expect(matchesStreet('Проїзна вулиця', 'Проїздна 23')).toBe(true);
  const dnipro: Place = {
    id: 'dnipro',
    name: 'Дніпро',
    latitude: 48.4647,
    longitude: 35.0462,
    kind: 'city',
  };
  const local: Place = {
    id: 'avan',
    name: 'Проїзна вулиця, 23',
    detail: 'Авангард',
    latitude: 46.4517,
    longitude: 30.6364,
    kind: 'house',
  };
  const found = orderPlaces([dnipro, local], {latitude: 46.482, longitude: 30.732}, 'Проїздна 23');
  expect(found.map(place => place.id)).toEqual(['avan']);
});

test('typing the start of a street does not open the city Dnipro', () => {
  expect(searchPlaces('Про').some(place => place.id === 'dnipro')).toBe(false);
  expect(searchPlaces('Дніпро').some(place => place.id === 'dnipro')).toBe(true);
});
