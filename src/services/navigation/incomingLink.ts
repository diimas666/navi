import type {Place} from '../../models/domain';
import {suggestPlaces} from '../maps/Geocoder';
import {googleResolve, hasCoordinates} from '../maps/googlePlaces';
import {resolveLanguage} from '../../i18n/settingsCopy';
import {useSettingsStore} from '../../store/settingsStore';

export type IncomingDest = {
  latitude?: number;
  longitude?: number;
  name?: string;
  query?: string;
};

export function parseNavLink(raw: string): IncomingDest | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return fromQuery(trimmed);
  }
  const host = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const query = params(parsed);
  if (parsed.protocol === 'geo:') {
    return fromGeo(parsed);
  }
  if (parsed.protocol === 'navi:') {
    return fromParams(query, `${parsed.hostname}${parsed.pathname}`);
  }
  if (parsed.protocol === 'waze:') {
    return fromParams(query);
  }
  if (parsed.protocol === 'comgooglemaps:') {
    return fromParams(query);
  }
  if (/google\.[^/]*\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(host)) {
    return fromGoogle(parsed, query);
  }
  if (/maps\.apple\.com/i.test(host)) {
    return fromParams(query);
  }
  return fromParams(query);
}

export async function resolveNavLink(raw: string): Promise<Place | null> {
  const expanded = await expandShort(raw);
  const dest = parseNavLink(expanded);
  if (!dest) {
    return null;
  }
  if (dest.latitude != null && dest.longitude != null) {
    return {
      id: `link-${dest.latitude.toFixed(5)}-${dest.longitude.toFixed(5)}`,
      name: dest.name || dest.query || `${dest.latitude.toFixed(5)}, ${dest.longitude.toFixed(5)}`,
      latitude: dest.latitude,
      longitude: dest.longitude,
      kind: 'link',
    };
  }
  const query = dest.query || dest.name;
  if (!query || query.trim().length < 2) {
    return null;
  }
  const found = await suggestPlaces(query);
  const first = found[0];
  if (!first) {
    return null;
  }
  if (first.placeId && !hasCoordinates(first)) {
    try {
      const point = await googleResolve(first.placeId, resolveLanguage(useSettingsStore.getState().language));
      return {...first, ...point, kind: first.kind || 'link'};
    } catch {
      return hasCoordinates(first) ? first : null;
    }
  }
  return hasCoordinates(first) ? first : null;
}

function fromGeo(url: URL): IncomingDest | null {
  const body = `${url.hostname}${url.pathname}`.replace(/^\/*/, '');
  const coords = pair(body);
  const query = params(url);
  const asked = query.q || query.query;
  if (asked) {
    const named = fromQuery(asked);
    if (coords && named.latitude == null) {
      return {latitude: coords.latitude, longitude: coords.longitude, name: named.name || named.query};
    }
    return named;
  }
  return coords;
}

function fromGoogle(url: URL, query: Record<string, string>): IncomingDest | null {
  const dest = fromParams(query);
  if (dest) {
    return dest;
  }
  const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at && valid(Number(at[1]), Number(at[2]))) {
    const place = decodeURIComponent(url.pathname.split('/@')[0].split('/').pop() ?? '').replace(/\+/g, ' ');
    return {latitude: Number(at[1]), longitude: Number(at[2]), name: place || undefined};
  }
  return null;
}

function fromParams(query: Record<string, string>, path = ''): IncomingDest | null {
  const dest = query.destination || query.daddr || query.ll || query.sll || query.center;
  if (dest) {
    const parsed = fromQuery(dest);
    if (parsed.latitude != null) {
      return named(parsed, query.q || query.query || parsed.name);
    }
    return parsed;
  }
  const lat = Number(query.lat || query.latitude);
  const lon = Number(query.lon || query.lng || query.longitude);
  if (valid(lat, lon)) {
    return named({latitude: lat, longitude: lon}, query.q || query.query || query.name);
  }
  const pathPair = pair(path.replace(/^\//, ''));
  if (pathPair) {
    return named(pathPair, query.q || query.name);
  }
  if (query.q || query.query || query.name || query.address) {
    return fromQuery(query.q || query.query || query.name || query.address || '');
  }
  return null;
}

function fromQuery(value: string): IncomingDest {
  const text = value.replace(/\+/g, ' ').trim();
  const labeled = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\((.+)\)$/.exec(text);
  if (labeled && valid(Number(labeled[1]), Number(labeled[2]))) {
    return {latitude: Number(labeled[1]), longitude: Number(labeled[2]), name: labeled[3].trim()};
  }
  const coords = pair(text);
  if (coords) {
    return coords;
  }
  return {query: text, name: text};
}

function named(dest: IncomingDest, name?: string): IncomingDest {
  if (!name) {
    return dest;
  }
  return {...dest, name};
}

function pair(value: string): IncomingDest | null {
  const match = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(value.trim());
  if (!match) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!valid(latitude, longitude)) {
    return null;
  }
  return {latitude, longitude};
}

function valid(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(Math.abs(latitude) < 0.02 && Math.abs(longitude) < 0.02)
  );
}

function params(url: URL): Record<string, string> {
  const found: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    found[key.toLowerCase()] = value;
  });
  return found;
}

async function expandShort(raw: string): Promise<string> {
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(raw)) {
    return raw;
  }
  try {
    const response = await fetch(raw);
    return response.url || raw;
  } catch {
    return raw;
  }
}
