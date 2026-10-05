import type {RoutePlan} from '../../models/domain';
import {haversineMeters} from '../../utils/geo';
import type {IndexedEdge, RoadGraph} from './RoadGraph';

const URBAN_SPEED_MPS = 16;

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
  path.forEach(edge => {
    const slice = coordinates.length > 0 ? edge.coordinates.slice(1) : edge.coordinates;
    coordinates.push(...slice);
    const previous = steps[steps.length - 1];
    if (previous && previous.name === edge.name) {
      previous.distanceM += edge.lengthM;
    } else {
      const [longitude, latitude] = edge.coordinates[0] ?? [0, 0];
      steps.push({
        name: edge.name,
        distanceM: edge.lengthM,
        alongM: distanceM,
        latitude,
        longitude,
        kind: steps.length === 0 ? 'depart' : 'turn',
      });
    }
    distanceM += edge.lengthM;
  });
  return {
    distanceM,
    durationS: distanceM / URBAN_SPEED_MPS,
    steps,
    coordinates,
  };
}

function driveCost(edge: IndexedEdge, avoid: Set<string>): number {
  const highway = edge.highway;
  let factor = 1;
  if (highway === 'service' || highway === 'living_street') {
    factor = 3.2;
  } else if (highway === 'residential' || highway === 'unclassified') {
    factor = 1.35;
  } else if (highway === 'tertiary' || highway === 'tertiary_link') {
    factor = 1.12;
  }
  const base = edge.id.replace(/:rev$/, '');
  if (avoid.has(base)) {
    factor *= 5;
  }
  return edge.lengthM * factor;
}

function aStar(graph: RoadGraph, startId: string, goalId: string, avoid: Set<string>): IndexedEdge[] | null {
  const goal = graph.node(goalId);
  const start = graph.node(startId);
  if (!goal || !start) {
    return null;
  }
  const open = new Heap();
  open.push(startId, haversineMeters(start.lat, start.lon, goal.lat, goal.lon));
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
      const heuristic = node ? haversineMeters(node.lat, node.lon, goal.lat, goal.lon) : 0;
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
