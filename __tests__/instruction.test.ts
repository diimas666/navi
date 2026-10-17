import {
  formatDriveMeters,
  loosenInstruction,
  modifierFromInstruction,
  streetFromInstruction,
  abbreviateStreet,
} from '../src/services/navigation/instruction';
import {nextCues} from '../src/services/navigation/maneuver';
import type {RoutePlan} from '../src/models/domain';

test('glued google text gets spaces and a street', () => {
  const raw = 'Повернітенаправонавул.Олексіївську';
  expect(loosenInstruction(raw)).toBe('Поверніте направо на вул. Олексіївську');
  expect(streetFromInstruction(raw)).toBe('вул. Олексіївську');
  expect(modifierFromInstruction(raw)).toBe('right');
});

test('a normal instruction keeps the street only', () => {
  expect(streetFromInstruction('Поверніте налево на вул. Торгову')).toBe('вул. Торгову');
  expect(modifierFromInstruction('Поверніте налево на вул. Торгову')).toBe('left');
});

test('long leftover distance is shown in kilometers', () => {
  expect(formatDriveMeters(9500)).toBe('9,5 км');
  expect(formatDriveMeters(19500)).toBe('20 км');
  expect(formatDriveMeters(80)).toBe('80 м');
});

test('cue shows a short turn and the full street', () => {
  const route: RoutePlan = {
    distanceM: 12000,
    durationS: 900,
    via: 'street',
    coordinates: [
      [30.72, 46.48],
      [30.73, 46.48],
      [30.8, 46.48],
    ],
    steps: [
      {name: '', distanceM: 100, alongM: 0, kind: 'depart', latitude: 46.48, longitude: 30.72},
      {
        name: 'Поверніте налево на вул. Олексіївську',
        distanceM: 400,
        alongM: 400,
        kind: 'turn',
        latitude: 46.48,
        longitude: 30.73,
      },
      {
        name: 'Повернітенаправонавул.Олексіївську',
        distanceM: 400,
        alongM: 900,
        kind: 'turn',
        latitude: 46.48,
        longitude: 30.74,
      },
    ],
  };
  const pair = nextCues(route, 46.48, 30.72, 'ru');
  expect(pair.current.title).toBe('Налево');
  expect(pair.current.street).toBe('вул. Олексіївську');
  expect(pair.after?.title).toBe('Направо');
  expect(pair.after?.street).toBe('вул. Олексіївську');
});

test('a heading instruction leaves only the street', () => {
  expect(streetFromInstruction('Направляйтесь на юго-восток по Лікарняна вулиця в сторону Пантелеймонівська')).toBe(
    'Лікарняна вулиця',
  );
});

test('road-sign remarks and Latin twins never reach the banner', () => {
  expect(
    streetFromInstruction(
      "рух по вулиця Велика Васильківська (знаки вулиця ЖИЛЯНСЬКА/ ZHYLYANS'KA Str/ вулиця ШОТА РУСТАВЕЛІ/SHOTA RUSTAVELI Str/ салон CERAMIC FASHION)",
    ),
  ).toBe('вулиця Велика Васильківська');
  expect(streetFromInstruction('Бессарабський проїзд')).toBe('Бессарабський проїзд');
  expect(streetFromInstruction('проспект Перемоги/Peremohy Ave')).toBe('проспект Перемоги');
  expect(abbreviateStreet('Михайлівська вулиця')).toBe('Михайлівська вул.');
  expect(abbreviateStreet('проспект Перемоги')).toBe('просп. Перемоги');
});
