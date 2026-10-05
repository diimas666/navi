import network from '../../assets/roads/network.json';
import type {RoadEdge, RoadNetwork, RoadNode} from '../../models/domain';
import {haversineMeters} from '../../utils/geo';

export type IndexedEdge = RoadEdge & {lengthM: number};

type CellKey = string;

export class RoadGraph {
  readonly nodes: RoadNode[];
  readonly edges: IndexedEdge[];
  private readonly nodeById = new Map<string, RoadNode>();
  private readonly adjacency = new Map<string, IndexedEdge[]>();
  private readonly cells = new Map<CellKey, IndexedEdge[]>();
  private readonly nodeCells = new Map<CellKey, RoadNode[]>();

  constructor(source: RoadNetwork) {
    this.nodes = source.nodes;
    this.edges = source.edges.map(edge => ({...edge, lengthM: polylineLength(edge.coordinates)}));
    this.nodes.forEach(node => this.nodeById.set(node.id, node));
    this.edges.forEach(edge => {
      push(this.adjacency, edge.from, edge);
      if (!edge.oneway) {
        push(this.adjacency, edge.to, reversed(edge));
      }
      edge.coordinates.forEach(([lon, lat]) => {
        push(this.cells, cellKey(lat, lon), edge);
      });
    });
    this.nodes.forEach(node => {
      push(this.nodeCells, cellKey(node.lat, node.lon), node);
    });
  }

  node(id: string): RoadNode | undefined {
    return this.nodeById.get(id);
  }

  neighbors(id: string): IndexedEdge[] {
    return this.adjacency.get(id) ?? [];
  }

  nearestNode(latitude: number, longitude: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const consider = (node: RoadNode) => {
      const distance = haversineMeters(latitude, longitude, node.lat, node.lon);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    };
    for (let ring = 0; ring <= 4; ring += 1) {
      for (let latStep = -ring; latStep <= ring; latStep += 1) {
        for (let lonStep = -ring; lonStep <= ring; lonStep += 1) {
          if (ring > 0 && Math.abs(latStep) !== ring && Math.abs(lonStep) !== ring) {
            continue;
          }
          const key = `${Math.floor(latitude / 0.05) + latStep}:${Math.floor(longitude / 0.05) + lonStep}`;
          (this.nodeCells.get(key) ?? []).forEach(consider);
        }
      }
      if (best && bestDistance < 800 * (ring + 1)) {
        return best;
      }
    }
    return best;
  }

  edgesNear(latitude: number, longitude: number): IndexedEdge[] {
    const found = new Map<string, IndexedEdge>();
    for (let latStep = -1; latStep <= 1; latStep += 1) {
      for (let lonStep = -1; lonStep <= 1; lonStep += 1) {
        const key = `${Math.floor(latitude / 0.05) + latStep}:${Math.floor(longitude / 0.05) + lonStep}`;
        (this.cells.get(key) ?? []).forEach(edge => found.set(edge.id, edge));
      }
    }
    return Array.from(found.values());
  }
}

export const bundledGraph = new RoadGraph(network as RoadNetwork);

function polylineLength(coordinates: Array<[number, number]>): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1];
    const [lonB, latB] = coordinates[index];
    total += haversineMeters(latA, lonA, latB, lonB);
  }
  return total;
}

function reversed(edge: IndexedEdge): IndexedEdge {
  return {
    ...edge,
    id: `${edge.id}:rev`,
    from: edge.to,
    to: edge.from,
    coordinates: [...edge.coordinates].reverse(),
  };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

function cellKey(latitude: number, longitude: number): string {
  return `${Math.floor(latitude / 0.05)}:${Math.floor(longitude / 0.05)}`;
}
