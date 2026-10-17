import {centerMovedFar, nearestTilesFirst, setLoadCenter, tileIdCenter} from '../src/services/maps/nearFirst';
import {tileId} from '../src/services/maps/houses';

test('tile id round-trips to its center', () => {
  const id = tileId({west: 30.5, south: 46.4, east: 30.6, north: 46.5});
  expect(tileIdCenter(id)).toEqual({latitude: 46.45, longitude: 30.55});
});

test('tiles near the load center come first', () => {
  const kyiv = {id: tileId({west: 30.5, south: 50.4, east: 30.6, north: 50.5})};
  const odesa = {id: tileId({west: 30.7, south: 46.4, east: 30.8, north: 46.5})};
  setLoadCenter({latitude: 46.48, longitude: 30.72});
  expect(nearestTilesFirst([kyiv, odesa])).toEqual([odesa, kyiv]);
  expect(centerMovedFar(46.5, 30.75)).toBe(false);
  expect(centerMovedFar(50.45, 30.52)).toBe(true);
  setLoadCenter(null);
  expect(centerMovedFar(50.45, 30.52)).toBe(true);
});
