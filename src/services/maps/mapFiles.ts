import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

import NativeMapStore from '../../native/NativeMapStore';
import type {BasemapMode} from './basemapStyle';
import {hideBasemapDistricts} from './basemapStyle';
import {buildLocalStyle, regionFileName} from './offlineStyle';
import {regionDataName} from './regionData';

/** Public release of this repo. Built by scripts/maps/build.py, uploaded by scripts/maps/publish.sh. */
const RELEASE = 'https://github.com/diimas666/navi/releases/download/maps-v1';
const MANIFEST = 'manifest.json';

export type MapManifest = {
  version: string;
  built: number;
  maxZoom: number;
  regions: Record<
    string,
    {asset: string; bytes: number; sha256?: string; data?: {asset: string; bytes: number}}
  >;
  assets: Array<{asset: string; path: string; bytes: number}>;
};

let remembered: MapManifest | null = null;

export function mapDirectory(): string | null {
  return NativeMapStore?.directory() ?? null;
}

/** Fresh manifest from the release, or the saved one when offline. */
export async function loadManifest(online: boolean): Promise<MapManifest | null> {
  const store = NativeMapStore;
  if (!store) {
    return null;
  }
  if (online) {
    try {
      const response = await fetch(`${RELEASE}/${MANIFEST}`, {headers: {'Cache-Control': 'no-cache'}});
      if (response.ok) {
        const text = await response.text();
        const parsed = parseManifest(text);
        if (parsed) {
          remembered = parsed;
          await store.saveText(MANIFEST, text);
          return parsed;
        }
      }
    } catch {
      // The saved manifest below still describes the files on the phone.
    }
  }
  if (remembered) {
    return remembered;
  }
  const saved = await store.readText(MANIFEST);
  remembered = saved ? parseManifest(saved) : null;
  return remembered;
}

export function parseManifest(text: string): MapManifest | null {
  try {
    const parsed = JSON.parse(text) as Partial<MapManifest>;
    if (typeof parsed.version !== 'string' || !parsed.regions || typeof parsed.regions !== 'object') {
      return null;
    }
    if (!Array.isArray(parsed.assets)) {
      return null;
    }
    return parsed as MapManifest;
  } catch {
    return null;
  }
}

/** Fonts, sprites and styles shared by all regions. Missing or resized files are fetched again. */
export async function ensureSharedFiles(manifest: MapManifest): Promise<void> {
  const store = NativeMapStore;
  if (!store) {
    throw new Error('map store unavailable');
  }
  for (const item of manifest.assets) {
    if ((await store.fileBytes(item.path)) === item.bytes) {
      continue;
    }
    await store.download(`${RELEASE}/${item.asset}`, item.path);
  }
}

async function sharedFilesReady(manifest: MapManifest | null): Promise<boolean> {
  const store = NativeMapStore;
  if (!store || !manifest) {
    return false;
  }
  for (const item of manifest.assets) {
    if ((await store.fileBytes(item.path)) <= 0) {
      return false;
    }
  }
  return true;
}

/** Downloads one region file, reporting 0..1. Resumes a broken download. */
export async function downloadRegionFile(
  manifest: MapManifest,
  regionId: string,
  onProgress: (fraction: number) => void,
): Promise<number> {
  const store = NativeMapStore;
  const entry = manifest.regions[regionId];
  if (!store || !entry) {
    throw new Error('region file unavailable');
  }
  const name = regionFileName(regionId);
  if ((await store.fileBytes(name)) === entry.bytes) {
    onProgress(1);
    return entry.bytes;
  }
  const timer = setInterval(() => {
    const fraction = store.downloadProgress(name);
    if (fraction >= 0) {
      onProgress(fraction);
    }
  }, 500);
  try {
    const bytes = await store.download(`${RELEASE}/${entry.asset}`, name);
    if (bytes !== entry.bytes) {
      await store.remove(name);
      throw new Error('region file size mismatch');
    }
    onProgress(1);
    return bytes;
  } finally {
    clearInterval(timer);
  }
}

/** Downloads the region database (addresses and roads), reporting 0..1. */
export async function downloadRegionData(
  manifest: MapManifest,
  regionId: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const store = NativeMapStore;
  const data = manifest.regions[regionId]?.data;
  if (!store || !data) {
    throw new Error('region data unavailable');
  }
  const name = regionDataName(regionId);
  if ((await store.fileBytes(name)) === data.bytes) {
    onProgress(1);
    return;
  }
  const timer = setInterval(() => {
    const fraction = store.downloadProgress(name);
    if (fraction >= 0) {
      onProgress(fraction);
    }
  }, 500);
  try {
    const bytes = await store.download(`${RELEASE}/${data.asset}`, name);
    if (bytes !== data.bytes) {
      await store.remove(name);
      throw new Error('region data size mismatch');
    }
    onProgress(1);
  } finally {
    clearInterval(timer);
  }
}

export async function regionDataBytes(regionId: string): Promise<number> {
  return (await NativeMapStore?.fileBytes(regionDataName(regionId))) ?? -1;
}

export async function removeRegionData(regionId: string): Promise<void> {
  const name = regionDataName(regionId);
  NativeMapStore?.cancelDownload(name);
  await NativeMapStore?.remove(name);
}

export async function regionFileBytes(regionId: string): Promise<number> {
  return (await NativeMapStore?.fileBytes(regionFileName(regionId))) ?? -1;
}

export async function removeRegionFile(regionId: string): Promise<void> {
  const name = regionFileName(regionId);
  NativeMapStore?.cancelDownload(name);
  await NativeMapStore?.remove(name);
}

/** The pinned style shipped with the map files, patched like the online one. */
async function readLocalBaseStyle(mode: BasemapMode): Promise<StyleSpecification | null> {
  const text = await NativeMapStore?.readText(`styles/${mode}.json`);
  if (!text) {
    return null;
  }
  try {
    return hideBasemapDistricts(JSON.parse(text) as StyleSpecification);
  } catch {
    return null;
  }
}

/** Map style drawn from downloaded region files, or null when none is ready on the phone. */
export async function loadLocalStyle(mode: BasemapMode, regionIds: string[]): Promise<StyleSpecification | null> {
  const directory = mapDirectory();
  if (!directory || regionIds.length === 0) {
    return null;
  }
  const manifest = await loadManifest(false);
  if (!(await sharedFilesReady(manifest))) {
    return null;
  }
  const base = await readLocalBaseStyle(mode);
  if (!base) {
    return null;
  }
  const present: string[] = [];
  for (const regionId of regionIds) {
    if ((await regionFileBytes(regionId)) > 0) {
      present.push(regionId);
    }
  }
  return present.length > 0 ? buildLocalStyle(base, directory, present) : null;
}
