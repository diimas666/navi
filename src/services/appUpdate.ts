import {APP_BUNDLE_ID, APP_VERSION} from '../constants/app';

export const UPDATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export type StoreUpdate = {
  version: string;
  storeUrl: string;
};

export type UpdateSnooze = {
  version: string;
  until: number;
};

export function versionParts(value: string): number[] {
  return value
    .trim()
    .split(/[^\d]+/)
    .filter(part => part.length > 0)
    .slice(0, 3)
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0));
}

export function versionAhead(store: string, local: string): boolean {
  const next = versionParts(store);
  const current = versionParts(local);
  const length = Math.max(next.length, current.length, 1);
  for (let index = 0; index < length; index += 1) {
    const a = next[index] ?? 0;
    const b = current[index] ?? 0;
    if (a > b) {
      return true;
    }
    if (a < b) {
      return false;
    }
  }
  return false;
}

export function parseStoreLookup(payload: unknown, local = APP_VERSION): StoreUpdate | null {
  if (!payload || typeof payload !== 'object' || !('results' in payload)) {
    return null;
  }
  const results = (payload as {results?: unknown}).results;
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  const row = results[0];
  if (!row || typeof row !== 'object') {
    return null;
  }
  const record = row as {version?: unknown; trackViewUrl?: unknown; trackId?: unknown};
  const version = typeof record.version === 'string' ? record.version.trim() : '';
  if (!version || !versionAhead(version, local)) {
    return null;
  }
  const trackViewUrl = typeof record.trackViewUrl === 'string' ? record.trackViewUrl : '';
  const trackId = typeof record.trackId === 'number' ? record.trackId : null;
  const storeUrl =
    trackViewUrl || (trackId != null ? `https://apps.apple.com/app/id${trackId}` : '');
  if (!storeUrl) {
    return null;
  }
  return {version, storeUrl};
}

export function shouldOfferUpdate(
  store: StoreUpdate | null,
  snooze: UpdateSnooze | null,
  now = Date.now(),
): boolean {
  if (!store) {
    return false;
  }
  if (snooze && snooze.version === store.version && snooze.until > now) {
    return false;
  }
  return true;
}

export function readUpdateSnooze(raw: string | null): UpdateSnooze | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as {version?: unknown; until?: unknown};
    if (typeof record.version !== 'string' || typeof record.until !== 'number') {
      return null;
    }
    return {version: record.version, until: record.until};
  } catch {
    return null;
  }
}

export async function fetchStoreUpdate(local = APP_VERSION): Promise<StoreUpdate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(APP_BUNDLE_ID)}&country=ua`,
      {signal: controller.signal, headers: {'User-Agent': 'Navi/1.0 (update check)'}},
    );
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
    return parseStoreLookup(payload, local);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
