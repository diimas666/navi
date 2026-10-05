import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'neiv.last-place.v1';

export async function loadLastPlace(): Promise<{latitude: number; longitude: number} | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const point = parsed as {latitude?: number; longitude?: number};
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return null;
    }
    if (Math.abs(point.latitude ?? 0) < 0.2 && Math.abs(point.longitude ?? 0) < 0.2) {
      return null;
    }
    return {latitude: point.latitude as number, longitude: point.longitude as number};
  } catch {
    return null;
  }
}

let savedAt = 0;

export function rememberPlace(latitude: number, longitude: number): void {
  const now = Date.now();
  if (now - savedAt < 8000) {
    return;
  }
  savedAt = now;
  AsyncStorage.setItem(KEY, JSON.stringify({latitude, longitude})).catch(() => undefined);
}
