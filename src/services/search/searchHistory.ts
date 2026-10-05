import type {Place} from '../../models/domain';
import {haversineMeters} from '../../utils/geo';

export const SEARCH_HISTORY_LIMIT = 16;

export type HistoryPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: string;
  detail?: string;
  at: number;
};

export function mergeHistory(items: HistoryPlace[], next: HistoryPlace, limit = SEARCH_HISTORY_LIMIT): HistoryPlace[] {
  const kept = items.filter(item => !sameHistory(item, next));
  return [next, ...kept].slice(0, limit);
}

export function historyFromPlace(place: Place): HistoryPlace | null {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
    return null;
  }
  if (Math.abs(place.latitude) < 0.2 && Math.abs(place.longitude) < 0.2) {
    return null;
  }
  const name = place.name.trim();
  if (name.length < 2) {
    return null;
  }
  return {
    id: place.id || `${place.longitude.toFixed(5)}:${place.latitude.toFixed(5)}`,
    name,
    latitude: place.latitude,
    longitude: place.longitude,
    kind: place.kind || 'search',
    detail: place.detail,
    at: Date.now(),
  };
}

export function matchesHistory(item: HistoryPlace, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return item.name.toLowerCase().includes(needle) || (item.detail ?? '').toLowerCase().includes(needle);
}

export function asPlace(item: HistoryPlace): Place {
  return {
    id: item.id,
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    kind: item.kind,
    detail: item.detail,
  };
}

export function parseSearchHistory(raw: string | null): HistoryPlace[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items: HistoryPlace[] = [];
    parsed.forEach(value => {
      if (!value || typeof value !== 'object') {
        return;
      }
      const row = value as Partial<HistoryPlace>;
      if (
        typeof row.id !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.latitude !== 'number' ||
        typeof row.longitude !== 'number'
      ) {
        return;
      }
      items.push({
        id: row.id,
        name: row.name,
        latitude: row.latitude,
        longitude: row.longitude,
        kind: typeof row.kind === 'string' ? row.kind : 'search',
        detail: typeof row.detail === 'string' ? row.detail : undefined,
        at: typeof row.at === 'number' ? row.at : 0,
      });
    });
    return items.slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function sameHistory(left: HistoryPlace, right: HistoryPlace): boolean {
  const away = haversineMeters(left.latitude, left.longitude, right.latitude, right.longitude);
  if (away < 28) {
    return true;
  }
  return left.name.trim().toLowerCase() === right.name.trim().toLowerCase() && away < 120;
}
