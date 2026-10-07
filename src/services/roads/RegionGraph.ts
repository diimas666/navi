import network from '../../assets/roads/network.json';
import type {RegionDefinition} from '../../constants/map';
import type {RoadEdge, RoadNetwork, RoadNode} from '../../models/domain';
import {bundledGraph, RoadGraph} from './RoadGraph';

const MAX_SEGMENTS = 250_000;

export type RoadWay = {
  id: string;
  name: string;
  highway: string;
  coordinates: Array<[number, number]>;
  oneway?: boolean;
};

const rank: Record<string, number> = {
  motorway: 0,
  motorway_link: 1,
  trunk: 2,
  trunk_link: 3,
  primary: 4,
  primary_link: 5,
  secondary: 6,
  secondary_link: 7,
  tertiary: 8,
  tertiary_link: 9,
  unclassified: 10,
};

let extras: RoadNetwork[] = [];
let cached: RoadGraph | null = null;

export function setRegionNetworks(networks: RoadNetwork[]): void {
  extras = networks;
  cached = null;
}

export function routingGraph(): RoadGraph {
  if (extras.length === 0) {
    return bundledGraph;
  }
  if (!cached) {
    const bundled = network as RoadNetwork;
    cached = new RoadGraph({
      nodes: [...bundled.nodes, ...extras.flatMap(item => item.nodes)],
      edges: [...bundled.edges, ...extras.flatMap(item => item.edges)],
    });
  }
  return cached;
}

export function waysToNetwork(ways: RoadWay[], maxSegments = MAX_SEGMENTS): RoadNetwork {
  const nodes = new Map<string, RoadNode>();
  const edges: RoadEdge[] = [];
  const ordered = [...ways].sort((left, right) => (rank[left.highway] ?? 20) - (rank[right.highway] ?? 20));
  let segments = 0;
  for (const way of ordered) {
    if (segments >= maxSegments) {
      break;
    }
    const coordinates = thin(way.coordinates, 32);
    for (let index = 1; index < coordinates.length; index += 1) {
      if (segments >= maxSegments) {
        break;
      }
      const from = nodeFor(coordinates[index - 1], nodes);
      const to = nodeFor(coordinates[index], nodes);
      if (from === to) {
        continue;
      }
      edges.push({
        id: `${way.id}:${index}`,
        from,
        to,
        name: way.name || way.highway,
        highway: way.highway,
        coordinates: [coordinates[index - 1], coordinates[index]],
        oneway: way.oneway === true,
      });
      segments += 1;
    }
  }
  return {nodes: Array.from(nodes.values()), edges};
}

const MAIN_HIGHWAYS =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street';

export function highwayFilter(_region: RegionDefinition, includeService = false): string {
  return includeService ? `${MAIN_HIGHWAYS}|service` : MAIN_HIGHWAYS;
}

export function streetTileIncludesService(area: number): boolean {
  return area <= 0.008;
}

export function shouldSplitStreetTile(error: unknown): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /payload too big|payload timeout|street tile incomplete|street tile timeout/i.test(message);
}

export function parseOverpass(payload: unknown): RoadWay[] {
  if (!payload || typeof payload !== 'object' || !('elements' in payload)) {
    return [];
  }
  const elements = (payload as {elements?: unknown}).elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  const ways: RoadWay[] = [];
  elements.forEach(element => {
    if (!element || typeof element !== 'object') {
      return;
    }
    const way = element as {
      type?: string;
      id?: number;
      tags?: Record<string, string>;
      geometry?: Array<{lat?: number; lon?: number}>;
    };
    const tags = way.tags ?? {};
    if (way.type !== 'way' || !way.geometry || !tags.highway) {
      return;
    }
    if (tags.access === 'no' || tags.motor_vehicle === 'no' || tags.motorcar === 'no') {
      return;
    }
    let coordinates = way.geometry
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
      .map(point => [point.lon as number, point.lat as number] as [number, number]);
    if (coordinates.length < 2) {
      return;
    }
    const reverse = tags.oneway === '-1';
    if (reverse) {
      coordinates = [...coordinates].reverse();
    }
    ways.push({
      id: `w${way.id ?? ways.length}`,
      name: tags.name ?? '',
      highway: tags.highway,
      coordinates,
      oneway: reverse || tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout',
    });
  });
  return ways;
}

function nodeFor(coordinate: [number, number], nodes: Map<string, RoadNode>): string {
  const [lon, lat] = coordinate;
  const key = `${lat.toFixed(4)}:${lon.toFixed(4)}`;
  if (!nodes.has(key)) {
    nodes.set(key, {
      id: key,
      name: '',
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      kind: 'junction',
    });
  }
  return key;
}

function thin(coordinates: Array<[number, number]>, limit: number): Array<[number, number]> {
  if (coordinates.length <= limit) {
    return coordinates;
  }
  const step = Math.ceil(coordinates.length / limit);
  const kept = coordinates.filter((_, index) => index % step === 0);
  const last = coordinates[coordinates.length - 1];
  const tail = kept[kept.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) {
    kept.push(last);
  }
  return kept;
}
