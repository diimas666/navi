import AsyncStorage from '@react-native-async-storage/async-storage';

import type {RegionDefinition} from '../../constants/map';
import type {RoadNetwork} from '../../models/domain';
import {jsonTooBig, readBoundedJson} from '../jsonLimit';
import {boundsArea, splitBounds, tileId, type Bounds} from '../maps/houses';
import {highwayFilter, parseOverpass, setRegionNetworks, waysToNetwork} from './RegionGraph';

const KEY = 'neiv.region-roads.v1';
const TILE_KEY = 'neiv.region-roads.v2';
const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

type RoadManifest = Record<string, {tiles: string[]; complete: boolean}>;

export async function fetchRegionRoads(
  region: RegionDefinition,
  onProgress?: (done: number, total: number) => void,
): Promise<RoadNetwork | null> {
  await downloadStreetTiles(region, onProgress);
  const stored = await readTileNetworks();
  const legacy = await readRoads();
  const networks = [...Object.values(legacy), ...stored];
  setRegionNetworks(networks);
  const own = stored.filter(network => network.edges.length > 0);
  if (own.length === 0) {
    return null;
  }
  return {
    nodes: own.flatMap(network => network.nodes),
    edges: own.flatMap(network => network.edges),
  };
}

export async function streetsAreComplete(regionId: string): Promise<boolean> {
  const manifest = await readRoadManifest();
  return manifest[regionId]?.complete === true;
}

export async function loadRegionRoads(): Promise<void> {
  const stored = await readRoads();
  const tiles = await readTileNetworks();
  setRegionNetworks([...Object.values(stored), ...tiles]);
}

export async function saveRegionRoads(regionId: string, roads: RoadNetwork | null): Promise<void> {
  const stored = await readRoads();
  if (roads && roads.edges.length > 0 && roads.edges.length <= 1500) {
    stored[regionId] = roads;
  } else {
    delete stored[regionId];
  }
  if (!roads) {
    await forgetStreetTiles(regionId);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  const tiles = await readTileNetworks();
  setRegionNetworks([...Object.values(stored), ...tiles]);
}

const STREET_TILE_AREA = 0.05;
const MAX_LOADED_EDGES = 60_000;

async function downloadStreetTiles(
  region: RegionDefinition,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const manifest = await readRoadManifest();
  const done = new Set(manifest[region.id]?.tiles ?? []);
  const bounds = {west: region.west, south: region.south, east: region.east, north: region.north};
  const seeds = tilesUnder(bounds, STREET_TILE_AREA);
  let finished = 0;
  let failed = false;
  onProgress?.(0, seeds.length);
  for (const seed of seeds) {
    const saved = await walk(seed, 0);
    if (!saved) {
      failed = true;
    }
    finished += 1;
    onProgress?.(finished, seeds.length);
  }
  manifest[region.id] = {tiles: Array.from(done), complete: !failed};
  await AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));

  async function walk(piece: Bounds, depth: number): Promise<boolean> {
    const id = tileId(piece);
    if (done.has(id)) {
      return true;
    }
    if (boundsArea(piece) > STREET_TILE_AREA && depth < 8) {
      let saved = true;
      for (const part of splitBounds(piece)) {
        const partSaved = await walk(part, depth + 1);
        saved = saved && partSaved;
      }
      return saved;
    }
    try {
      const network = await fetchStreetTile(piece, region);
      if (network.edges.length > 2000 && depth < 6 && boundsArea(piece) >= 0.0004) {
        throw new Error('street tile too dense');
      }
      const raw = JSON.stringify(network);
      if (jsonTooBig(raw)) {
        throw new Error('street tile too big');
      }
      await AsyncStorage.setItem(streetTileKey(region.id, id), raw);
      done.add(id);
      manifest[region.id] = {tiles: Array.from(done), complete: false};
      await AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));
      return true;
    } catch {
      if (depth >= 6 || boundsArea(piece) < 0.0004) {
        return false;
      }
      let saved = true;
      for (const part of splitBounds(piece)) {
        const partSaved = await walk(part, depth + 1);
        saved = saved && partSaved;
      }
      return saved;
    }
  }
}

function tilesUnder(bounds: Bounds, maxArea: number): Bounds[] {
  const pending = [bounds];
  const seeds: Bounds[] = [];
  while (pending.length > 0) {
    const piece = pending.pop();
    if (!piece) {
      break;
    }
    if (boundsArea(piece) > maxArea) {
      pending.push(...splitBounds(piece));
      continue;
    }
    seeds.push(piece);
  }
  return seeds;
}

async function fetchStreetTile(bounds: Bounds, region: RegionDefinition): Promise<RoadNetwork> {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:40];way["highway"~"^(${highwayFilter(region)})$"](${box});out geom;`;
  let lastError: unknown = new Error('streets unavailable');
  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22_000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Navi/1.0 (street graph)'},
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`streets ${response.status}`);
        }
        const payload = await readBoundedJson(response, undefined, () => controller.abort());
        if (payload && typeof payload === 'object' && 'remark' in payload) {
          const remark = String((payload as {remark?: unknown}).remark ?? '');
          if (/timeout|timed out|runtime error|out of memory/i.test(remark)) {
            throw new Error('street tile incomplete');
          }
        }
        return waysToNetwork(parseOverpass(payload));
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function readRoadManifest(): Promise<RoadManifest> {
  const raw = await AsyncStorage.getItem(TILE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as RoadManifest;
  } catch {
    return {};
  }
}

async function readTileNetworks(): Promise<RoadNetwork[]> {
  const manifest = await readRoadManifest();
  const networks: RoadNetwork[] = [];
  let edges = 0;
  let changed = false;
  for (const [regionId, entry] of Object.entries(manifest)) {
    const kept: string[] = [];
    for (const id of entry.tiles) {
      const key = streetTileKey(regionId, id);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) {
        continue;
      }
      if (jsonTooBig(raw)) {
        await AsyncStorage.removeItem(key);
        changed = true;
        continue;
      }
      kept.push(id);
      if (edges >= MAX_LOADED_EDGES) {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'edges' in parsed) {
          const network = parsed as RoadNetwork;
          edges += network.edges.length;
          networks.push(network);
        }
      } catch {
        // A broken tile is skipped. The next download fills it again.
      }
    }
    if (kept.length !== entry.tiles.length) {
      entry.tiles = kept;
      entry.complete = false;
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));
  }
  return networks;
}

async function forgetStreetTiles(regionId: string): Promise<void> {
  const manifest = await readRoadManifest();
  const tiles = manifest[regionId]?.tiles ?? [];
  await Promise.all(tiles.map(id => AsyncStorage.removeItem(streetTileKey(regionId, id))));
  delete manifest[regionId];
  await AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));
}

function streetTileKey(regionId: string, id: string): string {
  return `neiv.region-roads.v2.${regionId}.${id}`;
}

async function readRoads(): Promise<Record<string, RoadNetwork>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw || jsonTooBig(raw)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, RoadNetwork>;
  } catch {
    return {};
  }
}
