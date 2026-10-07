import AsyncStorage from '@react-native-async-storage/async-storage';

import type {RegionDefinition} from '../../constants/map';
import type {RoadNetwork} from '../../models/domain';
import {jsonTooBig, readBoundedJson} from '../jsonLimit';
import {boundsArea, splitBounds, tileId, type Bounds} from '../maps/houses';
import {
  highwayFilter,
  parseOverpass,
  setRegionNetworks,
  shouldSplitStreetTile,
  streetTileIncludesService,
  waysToNetwork,
} from './RegionGraph';
import {
  DownloadPaused,
  downloadGeneration,
  isDownloadPaused,
  noteDownloadPulse,
  throwIfPaused,
  trackAbort,
} from '../maps/downloadPause';
import {mapLimit, withOverpass} from '../maps/overpassGate';

const KEY = 'neiv.region-roads.v1';
const TILE_KEY = 'neiv.region-roads.v2';
const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
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

export async function reopenStreetDownload(regionId: string): Promise<void> {
  const manifest = await readRoadManifest();
  if (!manifest[regionId]) {
    return;
  }
  manifest[regionId] = {tiles: [], complete: false};
  await AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));
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
  const stamp = downloadGeneration();
  let failed = false;
  let writes = 0;
  let persist = Promise.resolve();
  const flushManifest = (complete: boolean) => {
    persist = persist.then(() => {
      manifest[region.id] = {tiles: Array.from(done), complete};
      return AsyncStorage.setItem(TILE_KEY, JSON.stringify(manifest));
    });
    return persist;
  };
  const noteTile = () => {
    writes += 1;
    return writes % 4 === 0 ? flushManifest(false) : Promise.resolve();
  };
  onProgress?.(done.size, seeds.length);
  let finished = false;
  try {
    const saved = await mapLimit(seeds, async seed => {
      throwIfPaused(stamp);
      const ok = await walk(seed, 0);
      onProgress?.(done.size, seeds.length);
      return ok;
    });
    failed = !saved;
    finished = true;
  } finally {
    await flushManifest(finished && !failed);
  }

  async function walk(piece: Bounds, depth: number): Promise<boolean> {
    const id = tileId(piece);
    if (done.has(id)) {
      return true;
    }
    if (boundsArea(piece) > STREET_TILE_AREA && depth < 8) {
      return mapLimit(splitBounds(piece), part => walk(part, depth + 1));
    }
    try {
      throwIfPaused(stamp);
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
      onProgress?.(done.size, seeds.length);
      await noteTile();
      return true;
    } catch (error) {
      if (isDownloadPaused(error)) {
        throw error;
      }
      if (depth >= 6 || boundsArea(piece) < 0.0004) {
        return false;
      }
      return mapLimit(splitBounds(piece), part => walk(part, depth + 1));
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
  const includeService = streetTileIncludesService(boundsArea(bounds));
  const query = `[out:json][timeout:18];way["highway"~"^(${highwayFilter(region, includeService)})$"](${box});out geom qt;`;
  let lastError: unknown = new Error('streets unavailable');
  for (const endpoint of ENDPOINTS) {
    const stamp = downloadGeneration();
    noteDownloadPulse();
    try {
      const controller = new AbortController();
      const release = trackAbort(controller);
      const timer = setTimeout(() => controller.abort(), 28_000);
      try {
        const payload = await withOverpass(async () => {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Navi/1.0 (street graph)'},
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
          });
          if (!response.ok) {
            if (response.status === 429 || response.status === 502 || response.status === 504) {
              await wait(1_800);
            }
            throw new Error(`streets ${response.status}`);
          }
          noteDownloadPulse();
          return readBoundedJson(response, undefined, () => controller.abort());
        });
        if (payload && typeof payload === 'object' && 'remark' in payload) {
          const remark = String((payload as {remark?: unknown}).remark ?? '');
          if (/timeout|timed out|runtime error|out of memory/i.test(remark)) {
            throw new Error('street tile incomplete');
          }
        }
        return waysToNetwork(parseOverpass(payload));
      } finally {
        clearTimeout(timer);
        release();
      }
    } catch (error) {
      if (stamp !== downloadGeneration()) {
        throw new DownloadPaused();
      }
      lastError = error;
      if (shouldSplitStreetTile(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
