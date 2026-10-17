import network from '../../assets/roads/network.json';
import type {RegionDefinition} from '../../constants/map';
import type {RoadEdge, RoadNetwork, RoadNode} from '../../models/domain';
import {bundledGraph, RoadGraph} from './RoadGraph';
import {parseMaxspeed} from './maxspeed';

const MAX_SEGMENTS = 250_000;

export type RoadWay = {
  id: string;
  name: string;
  highway: string;
  coordinates: Array<[number, number]>;
  oneway?: boolean;
  /** OSM node ids aligned with coordinates. Junctions are joined by id, not by rounded position. */
  nodeIds?: number[];
  maxspeed?: number;
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
  const uses = new Map<number, number>();
  ordered.forEach(way => {
    if (way.nodeIds && way.nodeIds.length === way.coordinates.length) {
      new Set(way.nodeIds).forEach(id => uses.set(id, (uses.get(id) ?? 0) + 1));
    }
  });
  let segments = 0;
  for (const way of ordered) {
    if (segments >= maxSegments) {
      break;
    }
    const points = keptPoints(way, uses, 32);
    for (let index = 1; index < points.length; index += 1) {
      if (segments >= maxSegments) {
        break;
      }
      const from = nodeFor(points[index - 1], nodes);
      const to = nodeFor(points[index], nodes);
      if (from === to) {
        continue;
      }
      edges.push({
        id: `${way.id}:${index}`,
        from,
        to,
        name: way.name || way.highway,
        highway: way.highway,
        coordinates: [points[index - 1].coordinate, points[index].coordinate],
        oneway: way.oneway === true,
        ...(way.maxspeed != null ? {maxspeed: way.maxspeed} : null),
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
      nodes?: number[];
    };
    const tags = way.tags ?? {};
    if (way.type !== 'way' || !way.geometry || !tags.highway) {
      return;
    }
    if (tags.access === 'no' || tags.motor_vehicle === 'no' || tags.motorcar === 'no') {
      return;
    }
    const aligned = Array.isArray(way.nodes) && way.nodes.length === way.geometry.length;
    let coordinates: Array<[number, number]> = [];
    let nodeIds: number[] | undefined = aligned ? [] : undefined;
    way.geometry.forEach((point, index) => {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
        return;
      }
      coordinates.push([point.lon as number, point.lat as number]);
      nodeIds?.push((way.nodes as number[])[index]);
    });
    if (coordinates.length < 2) {
      return;
    }
    const reverse = tags.oneway === '-1';
    if (reverse) {
      coordinates = [...coordinates].reverse();
      nodeIds = nodeIds ? [...nodeIds].reverse() : undefined;
    }
    ways.push({
      id: `w${way.id ?? ways.length}`,
      name: tags.name ?? '',
      highway: tags.highway,
      coordinates,
      oneway: reverse || tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout',
      ...(nodeIds ? {nodeIds} : null),
      ...(parseMaxspeed(tags.maxspeed) != null ? {maxspeed: parseMaxspeed(tags.maxspeed) as number} : null),
    });
  });
  return ways;
}

type KeptPoint = {coordinate: [number, number]; key: string};

function coordinateKey([lon, lat]: [number, number]): string {
  return `${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

/** Ends and junctions always stay. Shape points are thinned to keep the graph small. */
function keptPoints(way: RoadWay, uses: Map<number, number>, limit: number): KeptPoint[] {
  const ids = way.nodeIds && way.nodeIds.length === way.coordinates.length ? way.nodeIds : null;
  const step = Math.max(1, Math.ceil(way.coordinates.length / limit));
  const last = way.coordinates.length - 1;
  const kept: KeptPoint[] = [];
  way.coordinates.forEach((coordinate, index) => {
    const junction = ids ? (uses.get(ids[index]) ?? 0) > 1 : false;
    if (index !== 0 && index !== last && !junction && index % step !== 0) {
      return;
    }
    kept.push({coordinate, key: ids ? `n${ids[index]}` : coordinateKey(coordinate)});
  });
  return kept;
}

function nodeFor(point: KeptPoint, nodes: Map<string, RoadNode>): string {
  const [lon, lat] = point.coordinate;
  if (!nodes.has(point.key)) {
    nodes.set(point.key, {
      id: point.key,
      name: '',
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      kind: 'junction',
    });
  }
  return point.key;
}
