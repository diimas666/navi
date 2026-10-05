import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

export const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export const LOCAL_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'neiv-soft',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {'background-color': '#E8E4F2'},
    },
  ],
};

export type RegionDefinition = {
  id: string;
  name: string;
  sizeMb: number;
  west: number;
  south: number;
  east: number;
  north: number;
};

export const REGIONS: RegionDefinition[] = [
  {id: 'odesa', name: 'Одеська область', sizeMb: 118, west: 28.2, south: 45.2, east: 31.3, north: 48.2},
  {id: 'kyiv-oblast', name: 'Київська область', sizeMb: 188, west: 29.2, south: 49.1, east: 32.2, north: 51.5},
  {id: 'kyiv', name: 'Київ', sizeMb: 39, west: 30.2, south: 50.2, east: 30.9, north: 50.6},
  {id: 'lviv', name: 'Львівська область', sizeMb: 155, west: 22.6, south: 48.7, east: 25.5, north: 50.7},
  {id: 'kharkiv', name: 'Харківська область', sizeMb: 142, west: 34.8, south: 48.5, east: 38.0, north: 50.5},
  {id: 'dnipro', name: 'Дніпропетровська область', sizeMb: 155, west: 32.9, south: 47.4, east: 36.2, north: 49.2},
  {id: 'zaporizhzhia', name: 'Запорізька область', sizeMb: 37, west: 34.2, south: 46.3, east: 37.3, north: 48.1},
  {id: 'poltava', name: 'Полтавська область', sizeMb: 129, west: 32.1, south: 48.6, east: 35.5, north: 50.5},
  {id: 'vinnytsia', name: 'Вінницька область', sizeMb: 117, west: 27.3, south: 48.0, east: 30.0, north: 49.9},
  {id: 'chernivtsi', name: 'Чернівецька область', sizeMb: 48, west: 24.9, south: 47.7, east: 27.3, north: 48.7},
  {id: 'mykolaiv', name: 'Миколаївська область', sizeMb: 111, west: 30.2, south: 46.4, east: 33.2, north: 48.2},
  {id: 'ivano', name: 'Івано-Франківська область', sizeMb: 119, west: 23.5, south: 47.7, east: 25.7, north: 49.3},
  {id: 'volyn', name: 'Волинська область', sizeMb: 76, west: 23.6, south: 50.3, east: 26.2, north: 51.9},
  {id: 'zakarpattia', name: 'Закарпатська область', sizeMb: 89, west: 22.1, south: 47.9, east: 24.6, north: 49.1},
  {id: 'kherson', name: 'Херсонська область', sizeMb: 92, west: 31.5, south: 45.8, east: 35.2, north: 47.6},
  {id: 'khmelnytskyi', name: 'Хмельницька область', sizeMb: 98, west: 26.1, south: 48.4, east: 27.9, north: 50.6},
  {id: 'cherkasy', name: 'Черкаська область', sizeMb: 121, west: 29.6, south: 48.4, east: 32.9, north: 50.2},
  {id: 'chernihiv', name: 'Чернігівська область', sizeMb: 134, west: 30.4, south: 50.2, east: 33.5, north: 52.4},
  {id: 'sumy', name: 'Сумська область', sizeMb: 78, west: 32.9, south: 50.1, east: 35.7, north: 52.4},
  {id: 'rivne', name: 'Рівненська область', sizeMb: 99, west: 25.0, south: 50.0, east: 27.7, north: 51.9},
  {id: 'ternopil', name: 'Тернопільська область', sizeMb: 93, west: 24.7, south: 48.5, east: 26.4, north: 50.3},
  {id: 'zhytomyr', name: 'Житомирська область', sizeMb: 126, west: 27.2, south: 49.5, east: 29.8, north: 51.7},
  {id: 'kropyvnytskyi', name: 'Кіровоградська область', sizeMb: 151, west: 29.7, south: 47.7, east: 33.9, north: 49.3},
  {id: 'donetsk', name: 'Донецька область', sizeMb: 118, west: 36.5, south: 46.8, east: 39.1, north: 49.2},
  {id: 'luhansk', name: 'Луганська область', sizeMb: 109, west: 37.8, south: 47.8, east: 40.2, north: 50.1},
];
