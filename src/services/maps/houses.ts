import type {Place} from '../../models/domain';
import {haversineMeters} from '../../utils/geo';
import {matchesStreet, sameHouse, wantedHouse} from './addressQuery';

export type HousePoint = {
  street: string;
  house: string;
  city: string;
  latitude: number;
  longitude: number;
};

export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const MAX_INTERPOLATION_SPAN = 500;
export const HOUSE_MEMORY_CAP = 30_000;

let houses: HousePoint[] = [];
let byStreet: Map<string, HousePoint[]> | null = null;

export function replaceHouses(next: HousePoint[]): void {
  houses = dedupeHouses(next.slice(0, HOUSE_MEMORY_CAP));
  byStreet = null;
}

export function addHouses(next: HousePoint[]): void {
  if (next.length === 0 || houses.length >= HOUSE_MEMORY_CAP) {
    return;
  }
  const room = HOUSE_MEMORY_CAP - houses.length;
  houses = dedupeHouses([...houses, ...next.slice(0, room)]);
  byStreet = null;
}

export function housesNear(latitude: number, longitude: number, span = 0.02): HousePoint[] {
  const found: HousePoint[] = [];
  houses.forEach(house => {
    if (Math.abs(house.latitude - latitude) <= span && Math.abs(house.longitude - longitude) <= span) {
      found.push(house);
    }
  });
  return found;
}

export function searchDownloadedHouses(query: string): Place[] {
  const wanted = wantedHouse(query);
  if (!wanted) {
    return [];
  }
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const [street, group] of streetIndex()) {
    if (!matchesStreet(street, query)) {
      continue;
    }
    for (const house of group) {
      if (!sameHouse(house.house, wanted)) {
        continue;
      }
      const id = `${house.latitude.toFixed(5)}:${house.longitude.toFixed(5)}:${house.house}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const name = [house.street, house.house, house.city].filter(part => part.length > 0).join(', ');
      places.push({
        id: `house-${id}`,
        name,
        latitude: house.latitude,
        longitude: house.longitude,
        kind: 'house',
      });
      if (places.length >= 8) {
        return places;
      }
    }
  }
  return places;
}

/** Move a search hit onto the actual OSM house when the typed number is nearby. */
export function snapPlaceToHouse(place: Place, query = place.name): Place {
  const wanted = wantedHouse(query) ?? wantedHouse(place.name);
  if (!wanted || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
    return place;
  }
  let best: HousePoint | null = null;
  let bestM = 420;
  for (const house of housesNear(place.latitude, place.longitude, 0.006)) {
    if (!sameHouse(house.house, wanted)) {
      continue;
    }
    if (place.kind === 'street' || place.kind === 'house' || place.kind === 'address') {
      if (!matchesStreet(house.street, query) && !matchesStreet(house.street, place.name)) {
        continue;
      }
    }
    const away = haversineMeters(place.latitude, place.longitude, house.latitude, house.longitude);
    if (away >= bestM) {
      continue;
    }
    best = house;
    bestM = away;
  }
  if (!best) {
    return place;
  }
  return {
    ...place,
    kind: 'house',
    latitude: best.latitude,
    longitude: best.longitude,
    name: [best.street, best.house, best.city].filter(part => part.length > 0).join(', '),
  };
}

export function splitBounds(bounds: Bounds): Bounds[] {
  const latitude = (bounds.south + bounds.north) / 2;
  const longitude = (bounds.west + bounds.east) / 2;
  return [
    {west: bounds.west, south: bounds.south, east: longitude, north: latitude},
    {west: longitude, south: bounds.south, east: bounds.east, north: latitude},
    {west: bounds.west, south: latitude, east: longitude, north: bounds.north},
    {west: longitude, south: latitude, east: bounds.east, north: bounds.north},
  ];
}

export function tileId(bounds: Bounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map(value => Math.round(value * 1000)).join('_');
}

export function boundsArea(bounds: Bounds): number {
  return Math.max(0, bounds.north - bounds.south) * Math.max(0, bounds.east - bounds.west);
}

export function parseAddressPayload(payload: unknown): HousePoint[] {
  const elements = readElements(payload);
  const nodeById = new Map<string, OverpassElement>();
  elements.forEach(element => {
    if (element.id != null) {
      const previous = nodeById.get(String(element.id));
      nodeById.set(String(element.id), previous ? mergeElement(previous, element) : element);
    }
  });
  const found: HousePoint[] = [];
  elements.forEach(element => {
    const tags = element.tags ?? {};
    const interpolation = tags['addr:interpolation'];
    if (element.type === 'way' && interpolation) {
      found.push(...expandInterpolation(element, nodeById, interpolation));
      return;
    }
    const point = pointFromElement(element);
    if (point) {
      found.push(point);
    }
  });
  return dedupeHouses(found);
}

export function dedupeHouses(points: HousePoint[]): HousePoint[] {
  const seen = new Set<string>();
  const unique: HousePoint[] = [];
  points.forEach(point => {
    const key = `${point.street.toLowerCase()}|${point.house.toLowerCase()}|${point.latitude.toFixed(5)}|${point.longitude.toFixed(5)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(point);
  });
  return unique;
}

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: {lat?: number; lon?: number};
  nodes?: number[];
  tags?: Record<string, string>;
};

function streetIndex(): Map<string, HousePoint[]> {
  if (byStreet) {
    return byStreet;
  }
  const index = new Map<string, HousePoint[]>();
  houses.forEach(house => {
    const key = house.street;
    const group = index.get(key);
    if (group) {
      group.push(house);
    } else {
      index.set(key, [house]);
    }
  });
  byStreet = index;
  return index;
}

function readElements(payload: unknown): OverpassElement[] {
  if (!payload || typeof payload !== 'object' || !('elements' in payload)) {
    return [];
  }
  const elements = (payload as {elements?: unknown}).elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  return elements.filter(element => element && typeof element === 'object') as OverpassElement[];
}

function mergeElement(previous: OverpassElement, next: OverpassElement): OverpassElement {
  return {
    ...previous,
    ...next,
    lat: next.lat ?? previous.lat,
    lon: next.lon ?? previous.lon,
    center: next.center ?? previous.center,
    nodes: next.nodes ?? previous.nodes,
    tags: {...(previous.tags ?? {}), ...(next.tags ?? {})},
  };
}

function pointFromElement(element: OverpassElement): HousePoint | null {
  const tags = element.tags ?? {};
  const street = tags['addr:street'] ?? '';
  const house = tags['addr:housenumber'] ?? '';
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!street || !house || latitude == null || longitude == null) {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    street,
    house,
    city: tags['addr:city'] ?? '',
    latitude,
    longitude,
  };
}

function expandInterpolation(
  way: OverpassElement,
  nodeById: Map<string, OverpassElement>,
  mode: string,
): HousePoint[] {
  const chain = (way.nodes ?? [])
    .map(id => nodeById.get(String(id)))
    .filter((node): node is OverpassElement => node != null && node.lat != null && node.lon != null);
  const numbered: Array<{index: number; value: number; node: OverpassElement}> = [];
  chain.forEach((node, index) => {
    const raw = node.tags?.['addr:housenumber'];
    const value = raw == null ? Number.NaN : Number(raw);
    if (Number.isInteger(value)) {
      numbered.push({index, value, node});
    }
  });
  const created: HousePoint[] = [];
  for (let pair = 1; pair < numbered.length; pair += 1) {
    const from = numbered[pair - 1];
    const to = numbered[pair];
    if (Math.abs(to.value - from.value) > MAX_INTERPOLATION_SPAN) {
      continue;
    }
    const direction = to.value >= from.value ? 1 : -1;
    const step = mode === 'even' || mode === 'odd' ? 2 : 1;
    let number = from.value;
    if (mode === 'even' && Math.abs(number) % 2 === 1) {
      number += direction;
    }
    if (mode === 'odd' && Math.abs(number) % 2 === 0) {
      number += direction;
    }
    const startLat = from.node.lat ?? 0;
    const startLon = from.node.lon ?? 0;
    const endLat = to.node.lat ?? startLat;
    const endLon = to.node.lon ?? startLon;
    while (direction > 0 ? number <= to.value : number >= to.value) {
      const span = to.value - from.value;
      const ratio = span === 0 ? 0 : (number - from.value) / span;
      const street = from.node.tags?.['addr:street'] || way.tags?.['addr:street'] || '';
      if (street) {
        created.push({
          street,
          house: String(number),
          city: from.node.tags?.['addr:city'] || way.tags?.['addr:city'] || '',
          latitude: startLat + (endLat - startLat) * ratio,
          longitude: startLon + (endLon - startLon) * ratio,
        });
      }
      number += step * direction;
    }
  }
  return created;
}
