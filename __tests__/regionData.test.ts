import {cellOf, cellRows, edgesToNetwork} from '../src/services/maps/regionData';

jest.mock('@react-native-async-storage/async-storage', () => ({getItem: async () => null, setItem: async () => undefined}));
jest.mock('../src/native/NativeMapStore', () => null);

test('cells match scripts/maps/region_data.py', () => {
  // Values printed by region_data.cell_of for the same points.
  expect([cellOf(46.4825, 30.7233), cellOf(50.4501, 30.5234), cellOf(45.2, 28.2)]).toEqual([732421536, 752221526, 726021410]);
});

test('cell rows cover the box row by row', () => {
  const rows = cellRows(46.47, 30.71, 46.51, 30.75);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual([cellOf(46.47, 30.71), cellOf(46.47, 30.75)]);
  expect(rows[2][0]).toBe(cellOf(46.51, 30.71));
});

test('junction nodes come from edge ends and repeated edges merge', () => {
  const edge = {
    id: 'w1:1',
    from: 'n1',
    to: 'n2',
    name: 'Дерибасівська',
    highway: 'residential',
    coordinates: [
      [30.73, 46.48],
      [30.74, 46.48],
    ] as Array<[number, number]>,
  };
  const network = edgesToNetwork([edge, edge]);
  expect(network.edges).toHaveLength(1);
  expect(network.nodes.map(node => [node.id, node.lon])).toEqual([
    ['n1', 30.73],
    ['n2', 30.74],
  ]);
});
