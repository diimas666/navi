import AsyncStorage from '@react-native-async-storage/async-storage';

import type {RegionDefinition} from '../../constants/map';
import {jsonTooBig, readBoundedJson} from '../jsonLimit';
import {
  DownloadPaused,
  downloadGeneration,
  isDownloadPaused,
  noteDownloadPulse,
  throwIfPaused,
  trackAbort,
} from './downloadPause';
import {mapLimitVoid, withOverpass} from './overpassGate';
import {
  addHouses,
  boundsArea,
  HOUSE_MEMORY_CAP,
  parseAddressPayload,
  replaceHouses,
  splitBounds,
  tileId,
  type Bounds,
  type HousePoint,
} from './houses';

const MANIFEST_KEY = 'neiv.houses.v1';
const HOUSE_TILE_AREA = 0.02;
const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const MAX_SPLIT = 8;

type Manifest = Record<string, {tiles: string[]; complete: boolean}>;

export async function housesAreComplete(regionId: string): Promise<boolean> {
  const manifest = await readManifest();
  return manifest[regionId]?.complete === true;
}

export async function reopenHouseDownload(regionId: string): Promise<void> {
  const manifest = await readManifest();
  if (!manifest[regionId]) {
    return;
  }
  manifest[regionId] = {tiles: [], complete: false};
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

export async function loadAllHouses(): Promise<void> {
  const manifest = await readManifest();
  const loaded: HousePoint[] = [];
  let changed = false;
  for (const [regionId, entry] of Object.entries(manifest)) {
    const kept: string[] = [];
    for (const id of entry.tiles) {
      const tile = await readTile(regionId, id);
      if (tile === null) {
        changed = true;
        continue;
      }
      kept.push(id);
      if (loaded.length < HOUSE_MEMORY_CAP) {
        loaded.push(...tile.slice(0, HOUSE_MEMORY_CAP - loaded.length));
      }
    }
    if (kept.length !== entry.tiles.length) {
      entry.tiles = kept;
      entry.complete = false;
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  }
  replaceHouses(loaded);
}

export async function forgetRegionHouses(regionId: string): Promise<void> {
  const manifest = await readManifest();
  const tiles = manifest[regionId]?.tiles ?? [];
  if (tiles.length > 0) {
    await Promise.all(tiles.map(id => AsyncStorage.removeItem(tileKey(regionId, id))));
  }
  delete manifest[regionId];
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  await loadAllHouses();
}

export async function downloadRegionHouses(
  region: RegionDefinition,
  onProgress: (fraction: number) => void,
): Promise<number> {
  const manifest = await readManifest();
  const done = new Set(manifest[region.id]?.tiles ?? []);
  const stamp = downloadGeneration();
  const bounds = {west: region.west, south: region.south, east: region.east, north: region.north};
  const total = Math.max(boundsArea(bounds), 0.000001);
  let covered = 0;
  let writes = 0;
  let persist = Promise.resolve();
  const mark = (piece: Bounds) => {
    covered += boundsArea(piece);
    onProgress(Math.max(0, Math.min(1, covered / total)));
  };
  const flushManifest = (complete: boolean) => {
    persist = persist.then(() => {
      manifest[region.id] = {tiles: Array.from(done), complete};
      return AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    });
    return persist;
  };
  const noteTile = () => {
    writes += 1;
    return writes % 4 === 0 ? flushManifest(false) : Promise.resolve();
  };
  let finished = false;
  try {
    await walk(bounds, 0);
    finished = true;
  } finally {
    await flushManifest(finished);
  }
  async function walk(piece: Bounds, depth: number): Promise<void> {
    throwIfPaused(stamp);
    const id = tileId(piece);
    if (done.has(id)) {
      mark(piece);
      return;
    }
    if (boundsArea(piece) > HOUSE_TILE_AREA && depth < MAX_SPLIT) {
      await mapLimitVoid(splitBounds(piece), part => walk(part, depth + 1));
      return;
    }
    try {
      const points = await fetchBounds(piece);
      if (points.length > 4000 && depth < MAX_SPLIT && boundsArea(piece) >= 0.0004) {
        throw new Error('address tile too dense');
      }
      await writeTile(region.id, id, points);
      addHouses(points);
      done.add(id);
      await noteTile();
      mark(piece);
    } catch (error) {
      if (isDownloadPaused(error)) {
        throw error;
      }
      const tiny = boundsArea(piece) < 0.0004;
      if (depth >= MAX_SPLIT || tiny) {
        throw error;
      }
      await mapLimitVoid(splitBounds(piece), part => walk(part, depth + 1));
    }
  }
  return done.size;
}

async function fetchBounds(bounds: Bounds): Promise<HousePoint[]> {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:18];(node["addr:housenumber"](${box});way["addr:housenumber"](${box});way["addr:interpolation"](${box});node["entrance"](${box}););out body center qt;>;out skel qt;`;
  let lastError: unknown = new Error('addresses unavailable');
  for (const endpoint of ENDPOINTS) {
    try {
      const payload = await postOverpass(endpoint, query);
      if (isPartial(payload)) {
        throw new Error('address tile incomplete');
      }
      return parseAddressPayload(payload);
    } catch (error) {
      if (isDownloadPaused(error)) {
        throw error;
      }
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/payload too big|payload timeout|address tile incomplete/i.test(message)) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function postOverpass(endpoint: string, query: string): Promise<unknown> {
  const stamp = downloadGeneration();
  noteDownloadPulse();
  const controller = new AbortController();
  const release = trackAbort(controller);
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    return await withOverpass(async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Navi/1.0 (offline house download)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429 || response.status === 502 || response.status === 504) {
          await new Promise<void>(resolve => setTimeout(resolve, 1_800));
        }
        throw new Error(`address request ${response.status}`);
      }
      noteDownloadPulse();
      return readBoundedJson(response, undefined, () => controller.abort());
    });
  } catch (error) {
    if (stamp !== downloadGeneration()) {
      throw new DownloadPaused();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    release();
  }
}

function isPartial(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return true;
  }
  const remark = 'remark' in payload ? String((payload as {remark?: unknown}).remark ?? '') : '';
  return /timeout|timed out|runtime error|out of memory/i.test(remark);
}

async function readManifest(): Promise<Manifest> {
  const raw = await AsyncStorage.getItem(MANIFEST_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Manifest;
  } catch {
    return {};
  }
}

async function readTile(regionId: string, id: string): Promise<HousePoint[] | null> {
  const raw = await AsyncStorage.getItem(tileKey(regionId, id));
  if (!raw) {
    return [];
  }
  if (jsonTooBig(raw)) {
    await AsyncStorage.removeItem(tileKey(regionId, id));
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const points: HousePoint[] = [];
    parsed.forEach(row => {
      if (!Array.isArray(row) || row.length < 5) {
        return;
      }
      const [street, house, city, latitude, longitude, entrance] = row;
      if (typeof street !== 'string' || typeof house !== 'string') {
        return;
      }
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return;
      }
      points.push({
        street,
        house,
        city: typeof city === 'string' ? city : '',
        latitude,
        longitude,
        entrance: typeof entrance === 'string' && entrance.length > 0 ? entrance : undefined,
      });
    });
    return points;
  } catch {
    return [];
  }
}

async function writeTile(regionId: string, id: string, points: HousePoint[]): Promise<void> {
  const compact = points.map(point => [
    point.street,
    point.house,
    point.city,
    Number(point.latitude.toFixed(6)),
    Number(point.longitude.toFixed(6)),
    point.entrance ?? '',
  ]);
  const raw = JSON.stringify(compact);
  if (jsonTooBig(raw)) {
    throw new Error('address tile too big');
  }
  await AsyncStorage.setItem(tileKey(regionId, id), raw);
}

function tileKey(regionId: string, id: string): string {
  return `neiv.houses.v1.${regionId}.${id}`;
}
