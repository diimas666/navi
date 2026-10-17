import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

import {buildLocalStyle, tileSources, usesLocalGlyphs} from '../src/services/maps/offlineStyle';
import {parseManifest} from '../src/services/maps/mapFiles';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
}));
jest.mock('../src/native/NativeMapStore', () => null);

const base: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  sources: {openmaptiles: {type: 'vector', url: 'https://tiles.openfreemap.org/planet'}},
  layers: [
    {id: 'background', type: 'background', paint: {'background-color': '#fff'}},
    {id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water'},
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      layout: {'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular']},
    },
  ],
};

test('every tile layer repeats for each downloaded region after the online copy', () => {
  const style = buildLocalStyle(base, '/var/mobile/Library/NeivMaps/', ['kyiv', 'odesa']);
  expect(style.layers.map(layer => layer.id)).toEqual([
    'background',
    'water',
    'water@kyiv',
    'water@odesa',
    'road-label',
    'road-label@kyiv',
    'road-label@odesa',
  ]);
  expect(style.sources['omt-kyiv']).toEqual({
    type: 'vector',
    url: 'pmtiles://file:///var/mobile/Library/NeivMaps/maps/kyiv.pmtiles',
  });
  expect(tileSources(style)).toEqual(['openmaptiles', 'omt-kyiv', 'omt-odesa']);
});

test('glyphs and sprites come from the phone, font names without spaces', () => {
  const style = buildLocalStyle(base, '/maps', ['kyiv']);
  expect(style.glyphs).toBe('file:///maps/fonts/{fontstack}/{range}.pbf');
  expect(style.sprite).toBe('file:///maps/sprites/ofm');
  expect(usesLocalGlyphs(style)).toBe(true);
  expect(usesLocalGlyphs(base)).toBe(false);
  const label = style.layers.find(layer => layer.id === 'road-label@kyiv');
  expect(label?.type === 'symbol' && label.layout?.['text-font']).toEqual(['Noto-Sans-Regular']);
});

test('a broken manifest is ignored', () => {
  expect(parseManifest('{"version": 1}')).toBeNull();
  expect(parseManifest('nope')).toBeNull();
  expect(parseManifest('{"version":"20261017","built":1,"maxZoom":14,"regions":{},"assets":[]}')?.version).toBe(
    '20261017',
  );
});
