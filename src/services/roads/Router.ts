import type {RoutePlan} from '../../models/domain';
import {bearingDegrees, haversineMeters} from '../../utils/geo';
import type {IndexedEdge, RoadGraph} from './RoadGraph';
import {highwayLimitKmh} from '../navigation/speedLimit';

/** Typical travel speed per road class, m/s. A* weighs time so trunks win over village shortcuts. */
const TRAVEL_MPS: Record<string, number> = {
  motorway: 31,
  motorway_link: 17,
  trunk: 25,
  trunk_link: 14,
  primary: 19,
  primary_link: 12,
  secondary: 16,
  secondary_link: 11,
  tertiary: 13,
  tertiary_link: 10,
  unclassified: 10,
  residential: 8,
  living_street: 4,
  service: 4,
};
const DEFAULT_MPS = 9;
const FASTEST_MPS = 31;

export function edgeSeconds(edge: {highway: string; lengthM: number}): number {
  return edge.lengthM / (TRAVEL_MPS[edge.highway] ?? DEFAULT_MPS);
}

export function planRoute(
  graph: RoadGraph,
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): RoutePlan | null {
  return planRoutes(graph, originLat, originLon, destinationLat, destinationLon, 1)[0] ?? null;
}

export function planRoutes(
  graph: RoadGraph,
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  count = 3,
): RoutePlan[] {
  const start = graph.nearestNode(originLat, originLon);
  const goal = graph.nearestNode(destinationLat, destinationLon);
  if (!start || !goal || start.id === goal.id) {
    return [];
  }
  const routes: RoutePlan[] = [];
  const avoid = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const path = aStar(graph, start.id, goal.id, avoid);
    if (!path) {
      break;
    }
    const plan = pathToPlan(path);
    if (routes.some(route => Math.abs(route.distanceM - plan.distanceM) < 40)) {
      break;
    }
    routes.push(plan);
    path.forEach(edge => avoid.add(edge.id.replace(/:rev$/, '')));
  }
  return routes;
}

function pathToPlan(path: IndexedEdge[]): RoutePlan {
  const coordinates: Array<[number, number]> = [];
  const steps: RoutePlan['steps'] = [];
  let distanceM = 0;
  let durationS = 0;
  path.forEach((edge, index) => {
    durationS += edgeSeconds(edge);
    const slice = coordinates.length > 0 ? edge.coordinates.slice(1) : edge.coordinates;
    coordinates.push(...slice);
    const previous = steps[steps.length - 1];
    if (previous && previous.name === edge.name) {
      previous.distanceM += edge.lengthM;
    } else {
      const [longitude, latitude] = edge.coordinates[0] ?? [0, 0];
      const prior = path[index - 1];
      steps.push({
        name: edge.name,
        distanceM: edge.lengthM,
        alongM: distanceM,
        latitude,
        longitude,
        kind: steps.length === 0 ? 'depart' : 'turn',
        modifier: prior ? turnSide(prior.coordinates, edge.coordinates) : undefined,
        speedKmh: edge.maxspeed ?? highwayLimitKmh(edge.highway),
      });
    }
    distanceM += edge.lengthM;
  });
  return {
    distanceM,
    durationS,
    steps,
    coordinates,
  };
}

export function turnSide(
  from: Array<[number, number]>,
  to: Array<[number, number]>,
): 'left' | 'right' | 'straight' | 'uturn' | undefined {
  const start = from.length >= 2 ? from[from.length - 2] : from[0];
  const mid = from[from.length - 1] ?? to[0];
  const end = to.length >= 2 ? to[1] : to[0];
  if (!start || !mid || !end) {
    return undefined;
  }
  const incoming = bearingDegrees(start[1], start[0], mid[1], mid[0]);
  const outgoing = bearingDegrees(mid[1], mid[0], end[1], end[0]);
  let delta = outgoing - incoming;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  if (Math.abs(delta) < 28) {
    return 'straight';
  }
  if (Math.abs(delta) > 155) {
    return 'uturn';
  }
  return delta > 0 ? 'right' : 'left';
}

function driveCost(edge: IndexedEdge, avoid: Set<string>): number {
  const base = edge.id.replace(/:rev$/, '');
  return edgeSeconds(edge) * (avoid.has(base) ? 5 : 1);
}

function aStar(graph: RoadGraph, startId: string, goalId: string, avoid: Set<string>): IndexedEdge[] | null {
  const goal = graph.node(goalId);
  const start = graph.node(startId);
  if (!goal || !start) {
    return null;
  }
  const open = new Heap();
  open.push(startId, haversineMeters(start.lat, start.lon, goal.lat, goal.lon) / FASTEST_MPS);
  const came = new Map<string, IndexedEdge>();
  const score = new Map<string, number>([[startId, 0]]);
  const seen = new Set<string>();

  while (open.size > 0) {
    const current = open.pop();
    if (!current || seen.has(current)) {
      continue;
    }
    if (current === goalId) {
      return reconstruct(came, current);
    }
    seen.add(current);
    graph.neighbors(current).forEach(edge => {
      const nextScore = (score.get(current) ?? Infinity) + driveCost(edge, avoid);
      if (nextScore >= (score.get(edge.to) ?? Infinity)) {
        return;
      }
      came.set(edge.to, edge);
      score.set(edge.to, nextScore);
      const node = graph.node(edge.to);
      const heuristic = node ? haversineMeters(node.lat, node.lon, goal.lat, goal.lon) / FASTEST_MPS : 0;
      open.push(edge.to, nextScore + heuristic);
    });
  }
  return null;
}

class Heap {
  private readonly items: Array<{id: string; rank: number}> = [];

  get size(): number {
    return this.items.length;
  }

  push(id: string, rank: number): void {
    this.items.push({id, rank});
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentItem = this.items[parent];
      const current = this.items[index];
      if (!parentItem || !current || parentItem.rank <= current.rank) {
        break;
      }
      this.items[parent] = current;
      this.items[index] = parentItem;
      index = parent;
    }
  }

  pop(): string | undefined {
    const root = this.items[0];
    const last = this.items.pop();
    if (!root) {
      return undefined;
    }
    if (!last || this.items.length === 0) {
      return root.id;
    }
    this.items[0] = last;
    let index = 0;
    while (index < this.items.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      let next = index;
      const leftItem = this.items[left];
      const rightItem = this.items[right];
      const nextItem = this.items[next];
      if (leftItem && nextItem && leftItem.rank < nextItem.rank) {
        next = left;
      }
      const chosen = this.items[next];
      if (rightItem && chosen && rightItem.rank < chosen.rank) {
        next = right;
      }
      if (next === index) {
        break;
      }
      const current = this.items[index];
      const swap = this.items[next];
      if (!current || !swap) {
        break;
      }
      this.items[index] = swap;
      this.items[next] = current;
      index = next;
    }
    return root.id;
  }
}

function reconstruct(came: Map<string, IndexedEdge>, goalId: string): IndexedEdge[] {
  const edges: IndexedEdge[] = [];
  let cursor: string | undefined = goalId;
  while (cursor) {
    const edge = came.get(cursor);
    if (!edge) {
      break;
    }
    edges.push(edge);
    cursor = edge.from;
  }
  return edges.reverse();
}
