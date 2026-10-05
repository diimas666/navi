import {OfflineManager} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import {REGIONS, VECTOR_STYLE_URL, type RegionDefinition} from '../../constants/map';
import {useMapStore, type RegionDownload} from '../../store/mapStore';
import {tripText} from '../../i18n/tripCopy';
import {uiCopy} from '../../i18n/uiCopy';
import {useSettingsStore} from '../../store/settingsStore';
import {AppError, logDeveloperError, toAppError} from '../errors/AppError';
import {downloadRegionHouses, forgetRegionHouses, housesAreComplete} from './houseDownload';
import {fetchRegionRoads, saveRegionRoads, streetsAreComplete} from '../roads/RegionRoads';
import {routingGraph} from '../roads/RegionGraph';

const KEY = 'neiv.regions.v1';
const runningDownloads = new Set<string>();

export function regionDownloadActive(regionId: string): boolean {
  return runningDownloads.has(regionId);
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

export async function downloadRegion(region: RegionDefinition): Promise<void> {
  if (runningDownloads.has(region.id)) {
    return;
  }
  runningDownloads.add(region.id);
  const existing = useMapStore.getState().regions[region.id];
  const hasPack = Boolean(existing?.packId);
  useMapStore.getState().patchRegion(region.id, {
    status: 'downloading',
    progress: hasPack ? 0.68 : 0.02,
    error: null,
  });
  try {
    let packId = existing?.packId ?? null;
    if (!packId) {
      const pack = await OfflineManager.createPack(
        {
          mapStyle: VECTOR_STYLE_URL,
          bounds: [region.west, region.south, region.east, region.north],
          minZoom: 8,
          maxZoom: 13,
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
      packId = pack.id;
      useMapStore.getState().patchRegion(region.id, {packId, progress: 0.68});
      await persistRegionState();
    }
    try {
      await fetchRegionRoads(region, (done, total) => {
        const copy = uiCopy(useSettingsStore.getState().language);
        const fraction = total === 0 ? 1 : done / total;
        useMapStore.getState().patchRegion(region.id, {
          progress: fraction,
          detail: `${copy.streetTiles} ${done}/${total}`,
        });
      });
    } catch {
      // Saved street tiles stay. The next download continues them.
    }
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
    const clipped = routingGraph().edges.some(edge =>
      edge.coordinates.some(
        ([lon, lat]) =>
          lon >= region.west && lon <= region.east && lat >= region.south && lat <= region.north,
      ),
    );
    useMapStore.getState().patchRegion(region.id, {
      status: 'downloaded',
      progress: 1,
      packId,
      detail: null,
      error: clipped ? null : tripText().roadsMissing,
    });
    await persistRegionState();
  } catch (error) {
    const appError = toAppError(error, 'OFFLINE_MAP_ERROR');
    logDeveloperError(appError);
    const current = useMapStore.getState().regions[region.id];
    if (current?.status !== 'error') {
      useMapStore.getState().patchRegion(region.id, {status: 'error', error: appError.userMessage});
    }
    throw appError;
  } finally {
    runningDownloads.delete(region.id);
  }
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
  useMapStore.getState().patchRegion(regionId, {
    status: 'idle',
    progress: 0,
    packId: null,
    error: null,
    detail: null,
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
