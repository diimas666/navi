import {haversineMeters} from '../src/utils/geo';
import {matchToRoad} from '../src/services/roads/RoadMatcher';
import {planRoute, planRoutes} from '../src/services/roads/Router';
import {RoadGraph, bundledGraph} from '../src/services/roads/RoadGraph';
import {searchPlaces} from '../src/services/maps/Geocoder';

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

test('haversine is symmetric', () => {
  const forward = haversineMeters(50.45, 30.52, 46.48, 30.72);
  const backward = haversineMeters(46.48, 30.72, 50.45, 30.52);
  expect(Math.abs(forward - backward)).toBeLessThan(1);
});
