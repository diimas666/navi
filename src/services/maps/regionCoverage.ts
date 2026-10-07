import {REGIONS, type RegionDefinition} from '../../constants/map';
import {useMapStore} from '../../store/mapStore';
import {haversineMeters} from '../../utils/geo';

const SAMPLE_M = 8000;
const EDGE_AHEAD_M = 12_000;
export const MAP_STALE_MS = 14 * 24 * 60 * 60 * 1000;

export function regionIsStale(updatedAt: number | null | undefined, now = Date.now()): boolean {
  return updatedAt != null && now - updatedAt >= MAP_STALE_MS;
}

export function regionContains(region: RegionDefinition, latitude: number, longitude: number): boolean {
  return (
    longitude >= region.west &&
    longitude <= region.east &&
    latitude >= region.south &&
    latitude <= region.north
  );
}

export function regionArea(region: RegionDefinition): number {
  return Math.max(0.0001, (region.east - region.west) * (region.north - region.south));
}

export function regionCenter(region: RegionDefinition): {latitude: number; longitude: number} {
  return {
    latitude: (region.south + region.north) / 2,
    longitude: (region.west + region.east) / 2,
  };
}

export function regionsAt(latitude: number, longitude: number): RegionDefinition[] {
  return REGIONS.filter(region => regionContains(region, latitude, longitude)).sort((left, right) => {
    const leftCenter = regionCenter(left);
    const rightCenter = regionCenter(right);
    return (
      haversineMeters(latitude, longitude, leftCenter.latitude, leftCenter.longitude) -
      haversineMeters(latitude, longitude, rightCenter.latitude, rightCenter.longitude)
    );
  });
}

export function bestRegionAt(latitude: number, longitude: number): RegionDefinition | null {
  return regionsAt(latitude, longitude)[0] ?? null;
}

export function downloadedRegionIds(): Set<string> {
  return new Set(
    Object.values(useMapStore.getState().regions)
      .filter(region => region.status === 'downloaded')
      .map(region => region.id),
  );
}

export function isCovered(latitude: number, longitude: number, downloaded = downloadedRegionIds()): boolean {
  return regionsAt(latitude, longitude).some(region => downloaded.has(region.id));
}

export function coveringRegion(
  latitude: number,
  longitude: number,
  downloaded = downloadedRegionIds(),
): RegionDefinition | null {
  return regionsAt(latitude, longitude).find(region => downloaded.has(region.id)) ?? null;
}

export function missingRegionsAlong(
  coordinates: Array<[number, number]>,
  downloaded = downloadedRegionIds(),
): RegionDefinition[] {
  const seen = new Set<string>();
  const missing: RegionDefinition[] = [];
  sampleRoute(coordinates).forEach(([longitude, latitude]) => {
    if (isCovered(latitude, longitude, downloaded)) {
      return;
    }
    const nearest = bestRegionAt(latitude, longitude);
    if (!nearest || seen.has(nearest.id)) {
      return;
    }
    seen.add(nearest.id);
    missing.push(nearest);
  });
  return missing;
}

export function coverageGapAhead(
  latitude: number,
  longitude: number,
  coordinates: Array<[number, number]>,
  lookAheadM = EDGE_AHEAD_M,
  downloaded = downloadedRegionIds(),
): {meters: number; region: RegionDefinition | null} | null {
  if (!isCovered(latitude, longitude, downloaded) || coordinates.length < 2) {
    return null;
  }
  let walked = 0;
  let prevLat = latitude;
  let prevLon = longitude;
  for (const [lon, lat] of remainingFrom(coordinates, latitude, longitude)) {
    walked += haversineMeters(prevLat, prevLon, lat, lon);
    prevLat = lat;
    prevLon = lon;
    if (walked > lookAheadM) {
      return null;
    }
    if (isCovered(lat, lon, downloaded)) {
      continue;
    }
    return {meters: walked, region: bestRegionAt(lat, lon)};
  }
  return null;
}

export type NeedDownloadView = {
  busy: boolean;
  percent: number;
  detail: string | null;
  error: string | null;
};

export function needDownloadView(
  ids: string[],
  regions: Record<string, {status?: string; progress?: number; detail?: string | null; error?: string | null}>,
): NeedDownloadView {
  if (ids.length === 0) {
    return {busy: false, percent: 0, detail: null, error: null};
  }
  const states = ids.map(id => regions[id]);
  const busy = states.some(state => state?.status === 'downloading');
  const failed = states.find(state => state?.status === 'error');
  const progress = states.reduce((sum, state) => sum + (state?.progress ?? 0), 0) / ids.length;
  const percent = Math.max(busy ? 1 : 0, Math.min(99, Math.round(progress * 100)));
  const detail = states.find(state => state?.status === 'downloading' && state.detail)?.detail ?? null;
  return {busy, percent, detail, error: failed?.error ?? null};
}

export function formatRegionList(names: string[], language: 'uk' | 'ru'): string {
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return names[0];
  }
  const rest = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  return language === 'ru' ? `${rest} и ${last}` : `${rest} і ${last}`;
}

function sampleRoute(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length === 0) {
    return [];
  }
  const samples: Array<[number, number]> = [coordinates[0]];
  let walked = 0;
  let nextAt = SAMPLE_M;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon, lat] = coordinates[index];
    const [prevLon, prevLat] = coordinates[index - 1];
    walked += haversineMeters(prevLat, prevLon, lat, lon);
    if (walked >= nextAt) {
      samples.push(coordinates[index]);
      nextAt += SAMPLE_M;
    }
  }
  const last = coordinates[coordinates.length - 1];
  const tail = samples[samples.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) {
    samples.push(last);
  }
  return samples;
}

function remainingFrom(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
): Array<[number, number]> {
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length; index += 1) {
    const [lon, lat] = coordinates[index];
    const gap = haversineMeters(latitude, longitude, lat, lon);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  }
  return coordinates.slice(best);
}
