import {haversineMeters} from '../src/utils/geo';
import {matchToRoad} from '../src/services/roads/RoadMatcher';
import {planRoute, planRoutes, turnSide} from '../src/services/roads/Router';
import {guideRoute} from '../src/services/navigation/startTrip';
import {useSessionStore} from '../src/store/sessionStore';
import {RoadGraph, bundledGraph} from '../src/services/roads/RoadGraph';
import {searchPlaces} from '../src/services/maps/Geocoder';
import {waysToNetwork} from '../src/services/roads/RegionGraph';

test('a fix outside the map does not snap to a distant city', () => {
  expect(bundledGraph.nearestNode(37.78, -122.42)).toBeNull();
  expect(matchToRoad(bundledGraph, 37.78, -122.42, 20, 1)).toBeNull();
});

test('kyiv to odesa follows the highway graph', () => {
  const route = planRoute(bundledGraph, 50.45, 30.52, 46.48, 30.72);
  expect(route).not.toBeNull();
  expect(route?.steps.some(step => step.name === 'М-05')).toBe(true);
  expect(route?.distanceM).toBeGreaterThan(400_000);
});

test('road match does not snap when confidence is low', () => {
  const match = matchToRoad(bundledGraph, 50.45, 30.52, 80, 0.2);
  expect(match?.applied).toBe(false);
});

test('nearby point can snap onto a road', () => {
  const match = matchToRoad(bundledGraph, 50.4269, 30.3642, 20, 0.8);
  expect(match).not.toBeNull();
  expect(match && match.crossTrackM).toBeLessThan(500);
});

test('search finds Kyiv by a common alias', () => {
  expect(searchPlaces('киев').some(place => place.name === 'Київ')).toBe(true);
});

function junction(id: string, lat: number, lon: number) {
  return {id, name: id, lat, lon, kind: 'junction' as const};
}

test('oneway street is not driven backwards', () => {
  const graph = new RoadGraph({
    nodes: [junction('a', 50, 30), junction('b', 50.01, 30)],
    edges: [
      {
        id: 'ab',
        from: 'a',
        to: 'b',
        name: 'Одностороння',
        highway: 'residential',
        coordinates: [
          [30, 50],
          [30, 50.01],
        ],
        oneway: true,
      },
    ],
  });
  expect(planRoute(graph, 50, 30, 50.01, 30)?.steps[0]?.name).toBe('Одностороння');
  expect(planRoute(graph, 50.01, 30, 50, 30)).toBeNull();
});

test('a shorter alley is not chosen when a main road connects the same points', () => {
  const graph = new RoadGraph({
    nodes: [junction('a', 50, 30), junction('b', 50.004, 30.002), junction('c', 50.008, 30)],
    edges: [
      {
        id: 'alley',
        from: 'a',
        to: 'c',
        name: 'Провулок',
        highway: 'service',
        coordinates: [
          [30, 50],
          [30, 50.008],
        ],
      },
      {
        id: 'main1',
        from: 'a',
        to: 'b',
        name: 'Проспект',
        highway: 'primary',
        coordinates: [
          [30, 50],
          [30.002, 50.004],
        ],
      },
      {
        id: 'main2',
        from: 'b',
        to: 'c',
        name: 'Проспект',
        highway: 'primary',
        coordinates: [
          [30.002, 50.004],
          [30, 50.008],
        ],
      },
    ],
  });
  const route = planRoutes(graph, 50, 30, 50.008, 30)[0];
  expect(route?.steps.some(step => step.name === 'Проспект')).toBe(true);
  expect(route?.steps.some(step => step.name === 'Провулок')).toBe(false);
});

test('residential street is used when it is the only road to the house', () => {
  const graph = new RoadGraph({
    nodes: [junction('a', 50, 30), junction('b', 50.002, 30.002)],
    edges: [
      {
        id: 'yard',
        from: 'a',
        to: 'b',
        name: 'Житлова',
        highway: 'residential',
        coordinates: [
          [30, 50],
          [30.002, 50.002],
        ],
      },
    ],
  });
  expect(planRoute(graph, 50, 30, 50.002, 30.002)?.steps[0]?.name).toBe('Житлова');
});

test('lost route also ends driving so the tab bar comes back', () => {
  useSessionStore.setState({
    driving: true,
    destinationName: 'Альтаїр',
    destinationLatitude: 46.48,
    destinationLongitude: 30.72,
  });
  useSessionStore.getState().markRouteMissing();
  expect(useSessionStore.getState().driving).toBe(false);
  expect(useSessionStore.getState().route).toBeNull();
  expect(useSessionStore.getState().destinationName).toBe('Альтаїр');
  expect(useSessionStore.getState().destinationLatitude).toBe(46.48);
});

test('a missing street graph still gives a line to the address', () => {
  const guide = guideRoute(46.48, 30.72, 46.49, 30.74, 'Альтаїр');
  expect(guide).not.toBeNull();
  expect(guide?.coordinates).toHaveLength(2);
  expect(guide?.distanceM).toBeGreaterThan(1000);
  expect(guideRoute(46.48, 30.72, 46.48, 30.72)).toBeNull();
});

test('a street corner on the graph is a left or right turn', () => {
  expect(turnSide([[30, 50], [30, 50.01]], [[30, 50.01], [30.01, 50.01]])).toBe('right');
  expect(turnSide([[30, 50], [30, 50.01]], [[30, 50.01], [29.99, 50.01]])).toBe('left');
});

test('haversine is symmetric', () => {
  const forward = haversineMeters(50.45, 30.52, 46.48, 30.72);
  const backward = haversineMeters(46.48, 30.72, 50.45, 30.52);
  expect(Math.abs(forward - backward)).toBeLessThan(1);
});

test('a slightly longer trunk beats a village shortcut', () => {
  const edge = (id: string, from: string, to: string, highway: string, coordinates: Array<[number, number]>) => ({
    id,
    from,
    to,
    name: id,
    highway,
    coordinates,
  });
  const graph = new RoadGraph({
    nodes: [junction('a', 50, 30), junction('v', 50.05, 30), junction('t', 50.05, 30.02), junction('b', 50.1, 30)],
    edges: [
      edge('village-1', 'a', 'v', 'residential', [[30, 50], [30, 50.05]]),
      edge('village-2', 'v', 'b', 'residential', [[30, 50.05], [30, 50.1]]),
      edge('trunk-1', 'a', 't', 'trunk', [[30, 50], [30.02, 50.05]]),
      edge('trunk-2', 't', 'b', 'trunk', [[30.02, 50.05], [30, 50.1]]),
    ],
  });
  const route = planRoute(graph, 50, 30, 50.1, 30);
  expect(route?.steps.map(step => step.name)).toEqual(['trunk-1', 'trunk-2']);
  expect(route?.durationS).toBeLessThan(route!.distanceM / 8);
});

test('carriageways 5 m apart stay separate while a shared OSM node joins streets', () => {
  const long = Array.from({length: 100}, (_, i) => [30 + i * 0.0001, 50.001] as [number, number]);
  const network = waysToNetwork([
    {id: 'w1', name: 'Північна', highway: 'trunk', oneway: true, coordinates: [[30, 50], [30.002, 50]], nodeIds: [1, 2]},
    {id: 'w2', name: 'Південна', highway: 'trunk', oneway: true, coordinates: [[30.002, 50.00004], [30, 50.00004]], nodeIds: [3, 4]},
    {id: 'w3', name: 'Довга', highway: 'residential', coordinates: long, nodeIds: long.map((_, i) => 1000 + i)},
    {id: 'w4', name: 'Бічна', highway: 'residential', coordinates: [long[40], [30.004, 50.002]], nodeIds: [1040, 9]},
  ]);
  const graph = new RoadGraph(network);
  expect(graph.neighbors('n1040').map(edge => edge.name)).toContain('Бічна');
  expect(graph.neighbors('n1040').map(edge => edge.name)).toContain('Довга');
  expect(graph.nodes.filter(node => node.id.startsWith('n10')).length).toBeLessThan(40);
  expect(graph.neighbors('n2')).toHaveLength(0);
  expect(graph.neighbors('n3').map(edge => edge.name)).toEqual(['Південна']);
});
