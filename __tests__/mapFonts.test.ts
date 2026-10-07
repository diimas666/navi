import {MAP_FONT_BOLD, MAP_FONT_REGULAR, mapFontStack} from '../src/services/maps/mapFonts';

test('OpenFreeMap glyphs are requested as a single font', () => {
  expect(mapFontStack(['Noto Sans Bold', 'Noto Sans Regular'])).toEqual(MAP_FONT_BOLD);
  expect(mapFontStack(['Noto Sans Regular'])).toEqual(MAP_FONT_REGULAR);
  expect(mapFontStack(['Open Sans Regular', 'Arial Unicode MS Regular'])).toEqual(['Open Sans Regular']);
  expect(mapFontStack(null)).toEqual(MAP_FONT_REGULAR);
});
