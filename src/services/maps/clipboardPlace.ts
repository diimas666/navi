import type {Place} from '../../models/domain';
import {parseNavLink} from '../navigation/incomingLink';

export function placeFromClipboard(raw: string): Place | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) {
    return null;
  }
  const dest = parseNavLink(looksLikeLink(trimmed) ? trimmed : spacedCoords(trimmed) ?? trimmed);
  if (!dest) {
    return null;
  }
  if (dest.latitude != null && dest.longitude != null) {
    return {
      id: `clip-${dest.latitude.toFixed(5)}-${dest.longitude.toFixed(5)}`,
      name: dest.name || dest.query || `${dest.latitude.toFixed(5)}, ${dest.longitude.toFixed(5)}`,
      latitude: dest.latitude,
      longitude: dest.longitude,
      kind: 'clipboard',
    };
  }
  const query = dest.query || dest.name;
  if (!query || query.trim().length < 3 || !looksLikeLink(trimmed)) {
    return null;
  }
  return {
    id: `clip-query-${query.slice(0, 24)}`,
    name: query,
    latitude: Number.NaN,
    longitude: Number.NaN,
    kind: 'clipboard',
    detail: query,
  };
}

function looksLikeLink(value: string): boolean {
  return /^(geo:|navi:|waze:|comgooglemaps:|https?:)/i.test(value) || /maps\.(google|apple|app\.goo)/i.test(value);
}

function spacedCoords(value: string): string | null {
  const match = /^(-?\d{1,2}(?:\.\d+)?)\s+(-?\d{1,3}(?:\.\d+)?)$/.exec(value);
  if (!match) {
    return null;
  }
  return `${match[1]}, ${match[2]}`;
}
