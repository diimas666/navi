import {OfflineManager} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import {PACK_MAX_ZOOM, REGIONS, VECTOR_STYLE_URL, type RegionDefinition} from '../../constants/map';
import {regionIsStale} from './regionCoverage';
import {useMapStore, type RegionDownload} from '../../store/mapStore';
import {tripText} from '../../i18n/tripCopy';
import {uiCopy} from '../../i18n/uiCopy';
import {useSettingsStore} from '../../store/settingsStore';
import {AppError, logDeveloperError, toAppError} from '../errors/AppError';
import {
  DownloadPaused,
  clearDownloadPause,
  downloadGeneration,
  downloadStalled,
  isDownloadPaused,
  noteDownloadPulse,
  pauseDownloads,
  throwIfPaused,
} from './downloadPause';
import {downloadRegionHouses, forgetRegionHouses, housesAreComplete, reopenHouseDownload} from './houseDownload';
import {fetchRegionRoads, reopenStreetDownload, saveRegionRoads, streetsAreComplete} from '../roads/RegionRoads';
import {routingGraph} from '../roads/RegionGraph';
import {
  downloadRegionData,
  downloadRegionFile,
  ensureSharedFiles,
  loadManifest,
  regionDataBytes,
  regionFileBytes,
  removeRegionData,
  removeRegionFile,
} from './mapFiles';
import {forgetRegionData} from './regionData';

const KEY = 'neiv.regions.v1';
const runningDownloads = new Set<string>();
const downloadTickets = new Map<string, number>();
let nextTicket = 1;

export function regionDownloadActive(regionId: string): boolean {
  return runningDownloads.has(regionId);
}

export function releaseRegionDownloads(): void {
  runningDownloads.clear();
  downloadTickets.clear();
}

export async function loadRegionState(): Promise<Record<string, RegionDownload>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  return parsed as Record<string, RegionDownload>;
}

export async function persistRegionState(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(useMapStore.getState().regions));
}

export async function downloadRegion(region: RegionDefinition, options?: {refresh?: boolean}): Promise<void> {
  if (runningDownloads.has(region.id)) {
    if (!downloadStalled()) {
      return;
    }
    pauseDownloads();
    releaseRegionDownloads();
    clearDownloadPause();
  }
  const ticket = nextTicket;
  nextTicket += 1;
  runningDownloads.add(region.id);
  downloadTickets.set(region.id, ticket);
  const stamp = downloadGeneration();
  noteDownloadPulse();
  const existing = useMapStore.getState().regions[region.id];
  if (options?.refresh) {
    await reopenHouseDownload(region.id);
    await reopenStreetDownload(region.id);
  }
  useMapStore.getState().patchRegion(region.id, {
    status: 'downloading',
    progress: 0.02,
    error: null,
    detail: options?.refresh ? uiCopy(useSettingsStore.getState().language).mapsUpdating : null,
  });
  try {
    const manifest = await loadManifest(true);
    let packId = existing?.packId ?? null;
    if (manifest?.regions[region.id]) {
      const current =
        !options?.refresh &&
        existing?.fileVersion != null &&
        (await regionFileBytes(region.id)) === manifest.regions[region.id].bytes;
      if (!current) {
        await ensureSharedFiles(manifest);
        throwIfPaused(stamp);
        await downloadRegionFile(manifest, region.id, fraction => {
          noteDownloadPulse();
          useMapStore.getState().patchRegion(region.id, {progress: Math.max(0.02, Math.min(0.68, fraction * 0.68))});
        });
      }
      if (packId) {
        // The region file replaces the old tile pack and its storage.
        await OfflineManager.deletePack(packId).catch(() => undefined);
        packId = null;
      }
      useMapStore.getState().patchRegion(region.id, {
        packId: null,
        packZoom: undefined,
        fileVersion: current ? existing?.fileVersion : manifest.version,
        progress: 0.68,
      });
      await persistRegionState();
    } else {
      packId = await ensureTilePack(region, existing, options?.refresh === true);
    }
    throwIfPaused(stamp);
    const data = manifest?.regions[region.id]?.data;
    let clipped = true;
    if (manifest && data) {
      const current =
        !options?.refresh &&
        existing?.dataVersion != null &&
        (await regionDataBytes(region.id)) === data.bytes;
      if (!current) {
        await downloadRegionData(manifest, region.id, fraction => {
          noteDownloadPulse();
          const copy = uiCopy(useSettingsStore.getState().language);
          useMapStore.getState().patchRegion(region.id, {
            progress: Math.max(0.68, Math.min(0.99, 0.68 + fraction * 0.31)),
            detail: `${copy.houseTiles} ${Math.round(fraction * 100)}%`,
          });
        });
      }
      forgetRegionData(region.id);
      useMapStore.getState().patchRegion(region.id, {dataVersion: current ? existing?.dataVersion : manifest.version});
      // The database holds every street and house, so the Overpass tiles of this region go.
      await saveRegionRoads(region.id, null);
      await forgetRegionHouses(region.id);
    } else {
      try {
        await fetchRegionRoads(region, (done, total) => {
          const copy = uiCopy(useSettingsStore.getState().language);
          const fraction = total === 0 ? 1 : done / total;
          useMapStore.getState().patchRegion(region.id, {
            progress: 0.68 + fraction * 0.16,
            detail: `${copy.streetTiles} ${done}/${total}`,
          });
        });
      } catch (error) {
        if (isDownloadPaused(error)) {
          throw error;
        }
        // Saved street tiles stay. The next download continues them.
      }
      throwIfPaused(stamp);
      try {
        await downloadRegionHouses(region, fraction => {
          const copy = uiCopy(useSettingsStore.getState().language);
          useMapStore.getState().patchRegion(region.id, {
            progress: Math.max(0.84, Math.min(0.99, 0.84 + fraction * 0.15)),
            detail: `${copy.houseTiles} ${Math.round(fraction * 100)}%`,
          });
        });
      } catch (error) {
        const appError = new AppError('OFFLINE_MAP_ERROR', 'house download incomplete', tripText().housesMissing);
        logDeveloperError(toAppError(error, 'OFFLINE_MAP_ERROR'));
        useMapStore.getState().patchRegion(region.id, {status: 'error', packId, error: appError.userMessage});
        await persistRegionState();
        throw appError;
      }
      throwIfPaused(stamp);
      clipped = routingGraph().edges.some(edge =>
        edge.coordinates.some(
          ([lon, lat]) =>
            lon >= region.west && lon <= region.east && lat >= region.south && lat <= region.north,
        ),
      );
    }
    useMapStore.getState().patchRegion(region.id, {
      status: 'downloaded',
      progress: 1,
      packId,
      detail: null,
      error: clipped ? null : tripText().roadsMissing,
      updatedAt: Date.now(),
    });
    await persistRegionState();
  } catch (error) {
    if (error instanceof DownloadPaused || isDownloadPaused(error)) {
      return;
    }
    const appError = toAppError(error, 'OFFLINE_MAP_ERROR');
    logDeveloperError(appError);
    const current = useMapStore.getState().regions[region.id];
    if (current?.status !== 'error') {
      useMapStore.getState().patchRegion(region.id, {status: 'error', error: appError.userMessage});
    }
    throw appError;
  } finally {
    if (downloadTickets.get(region.id) === ticket) {
      runningDownloads.delete(region.id);
      downloadTickets.delete(region.id);
    }
  }
}

/** Fallback while the release has no file for this region: MapLibre tile pack from OpenFreeMap. */
async function ensureTilePack(
  region: RegionDefinition,
  existing: RegionDownload | undefined,
  refresh: boolean,
): Promise<string> {
  if (existing?.packId && !refresh && existing.packZoom === PACK_MAX_ZOOM) {
    useMapStore.getState().patchRegion(region.id, {progress: 0.68});
    return existing.packId;
  }
  if (existing?.packId) {
    await OfflineManager.deletePack(existing.packId).catch(() => undefined);
  }
  const pack = await OfflineManager.createPack(
    {
      mapStyle: VECTOR_STYLE_URL,
      bounds: [region.west, region.south, region.east, region.north],
      minZoom: 8,
      maxZoom: PACK_MAX_ZOOM,
      metadata: {id: region.id},
    },
    (_offlinePack, status) => {
      const ratio =
        status.requiredResourceCount > 0
          ? status.completedResourceCount / status.requiredResourceCount
          : status.percentage / 100;
      useMapStore.getState().patchRegion(region.id, {
        progress: Math.max(0.02, Math.min(0.68, ratio * 0.68)),
      });
    },
    (_offlinePack, error) => {
      useMapStore.getState().patchRegion(region.id, {
        status: 'error',
        error: error.message,
      });
    },
  );
  useMapStore.getState().patchRegion(region.id, {packId: pack.id, packZoom: PACK_MAX_ZOOM, progress: 0.68});
  await persistRegionState();
  return pack.id;
}

export async function removeRegion(regionId: string): Promise<void> {
  const current = useMapStore.getState().regions[regionId];
  if (current?.packId) {
    try {
      await OfflineManager.deletePack(current.packId);
    } catch (error) {
      logDeveloperError(toAppError(error, 'OFFLINE_MAP_ERROR'));
    }
  }
  await removeRegionFile(regionId).catch(() => undefined);
  forgetRegionData(regionId);
  await removeRegionData(regionId).catch(() => undefined);
  useMapStore.getState().patchRegion(regionId, {
    status: 'idle',
    progress: 0,
    packId: null,
    packZoom: undefined,
    fileVersion: undefined,
    dataVersion: undefined,
    error: null,
    detail: null,
    updatedAt: null,
  });
  await saveRegionRoads(regionId, null);
  await forgetRegionHouses(regionId);
  await persistRegionState();
}

export async function completeMissingHouses(): Promise<void> {
  const link = await NetInfo.fetch();
  if (link.isConnected === false || link.isInternetReachable === false) {
    return;
  }
  for (const region of REGIONS) {
    const state = useMapStore.getState().regions[region.id];
    const stalled = state?.status === 'downloading';
    const saved = state?.status === 'downloaded';
    if (!stalled && !saved) {
      continue;
    }
    if (saved && state.dataVersion != null) {
      continue;
    }
    if (saved) {
      const housesDone = await housesAreComplete(region.id);
      const streetsDone = await streetsAreComplete(region.id);
      if (housesDone && streetsDone) {
        continue;
      }
    }
    try {
      await downloadRegion(region);
    } catch {
      // The region row keeps the error. The next launch can continue the saved tiles.
    }
  }
}

export function regionById(id: string): RegionDefinition | undefined {
  return REGIONS.find(region => region.id === id);
}

export function downloadedRegionCount(): number {
  return Object.values(useMapStore.getState().regions).filter(item => item.status === 'downloaded')
    .length;
}

export {regionIsStale};

export async function refreshStaleRegions(): Promise<void> {
  const link = await NetInfo.fetch();
  if (link.isConnected === false || link.isInternetReachable === false) {
    return;
  }
  const now = Date.now();
  const manifest = await loadManifest(true);
  for (const region of REGIONS) {
    const state = useMapStore.getState().regions[region.id];
    if (state?.status !== 'downloaded') {
      continue;
    }
    if (state.updatedAt == null) {
      useMapStore.getState().patchRegion(region.id, {updatedAt: now});
      await persistRegionState();
      continue;
    }
    const onFile = state.fileVersion != null;
    const fileOffered = manifest?.regions[region.id] != null;
    // A region still on a tile pack moves to the region file, or at least to a z14 pack.
    const dataOffered = manifest?.regions[region.id]?.data != null;
    // A newer region database is small next to the map, so it comes without waiting for staleness.
    const newerData = dataOffered && state.dataVersion !== manifest?.version;
    const upgrade = (!onFile && (fileOffered || state.packZoom !== PACK_MAX_ZOOM)) || newerData;
    const stale = regionIsStale(state.updatedAt, now) && (!onFile || manifest?.version !== state.fileVersion);
    if (!upgrade && !stale) {
      continue;
    }
    try {
      await downloadRegion(region, upgrade ? undefined : {refresh: true});
    } catch {
      // The saved map stays. The next launch can try again.
    }
  }
}
