import {placeFromClipboard} from '../src/services/maps/clipboardPlace';

test('comma coordinates become a clipboard place', () => {
  const place = placeFromClipboard('46.48252, 30.72331');
  expect(place?.latitude).toBeCloseTo(46.48252);
  expect(place?.longitude).toBeCloseTo(30.72331);
  expect(place?.kind).toBe('clipboard');
});

test('space-separated coordinates are accepted', () => {
  const place = placeFromClipboard('46.48 30.72');
  expect(place?.latitude).toBeCloseTo(46.48);
  expect(place?.longitude).toBeCloseTo(30.72);
});

test('a geo link keeps the name', () => {
  const place = placeFromClipboard('geo:46.48,30.72?q=Армійська 4');
  expect(place?.latitude).toBeCloseTo(46.48);
  expect(place?.name).toContain('Армійська');
});

test('random chat text is ignored', () => {
  expect(placeFromClipboard('Привіт, як справи?')).toBeNull();
  expect(placeFromClipboard('')).toBeNull();
});
