import type {Place} from '../../models/domain';
import {useSessionStore} from '../../store/sessionStore';
import {haversineMeters} from '../../utils/geo';
import {matchesStreet, sameHouse, streetKey, wantedHouse} from './addressQuery';

export type HousePoint = {
  street: string;
  house: string;
  city: string;
  latitude: number;
  longitude: number;
  entrance?: string;
};

export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const MAX_INTERPOLATION_SPAN = 500;
export const HOUSE_MEMORY_CAP = 30_000;

const HOUSE_CELL = 0.02;

let houses: HousePoint[] = [];
let byStreet: Map<string, HousePoint[]> | null = null;
let houseCells: Map<string, HousePoint[]> | null = null;

export function replaceHouses(next: HousePoint[]): void {
  houses = dedupeHouses(next.slice(0, HOUSE_MEMORY_CAP));
  byStreet = null;
  houseCells = null;
}

export function addHouses(next: HousePoint[]): void {
  if (next.length === 0 || houses.length >= HOUSE_MEMORY_CAP) {
    return;
  }
  const room = HOUSE_MEMORY_CAP - houses.length;
  houses = dedupeHouses([...houses, ...next.slice(0, room)]);
  byStreet = null;
  houseCells = null;
}

export function housesNear(latitude: number, longitude: number, span = 0.02): HousePoint[] {
  const cells = houseIndex();
  const found: HousePoint[] = [];
  const lat0 = Math.floor((latitude - span) / HOUSE_CELL);
  const lat1 = Math.floor((latitude + span) / HOUSE_CELL);
  const lon0 = Math.floor((longitude - span) / HOUSE_CELL);
  const lon1 = Math.floor((longitude + span) / HOUSE_CELL);
  for (let latCell = lat0; latCell <= lat1; latCell += 1) {
    for (let lonCell = lon0; lonCell <= lon1; lonCell += 1) {
      const bucket = cells.get(`${latCell}:${lonCell}`);
      if (!bucket) {
        continue;
      }
      for (const house of bucket) {
        if (Math.abs(house.latitude - latitude) <= span && Math.abs(house.longitude - longitude) <= span) {
          found.push(house);
        }
      }
    }
  }
  return found;
}

function houseIndex(): Map<string, HousePoint[]> {
  if (houseCells) {
    return houseCells;
  }
  const cells = new Map<string, HousePoint[]>();
  for (const house of houses) {
    const key = `${Math.floor(house.latitude / HOUSE_CELL)}:${Math.floor(house.longitude / HOUSE_CELL)}`;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(house);
    } else {
      cells.set(key, [house]);
    }
  }
  houseCells = cells;
  return cells;
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

export function searchDownloadedStreets(query: string): Place[] {
  const needle = streetKey(query);
  if (needle.length < 2) {
    return [];
  }
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const [street, group] of streetIndex()) {
    if (!matchesStreet(street, query)) {
      continue;
    }
    const point = group.find(item => item.house) ?? group[0];
    if (!point) {
      continue;
    }
    const id = streetKey(street);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    places.push({
      id: `street-${id}`,
      name: street,
      latitude: point.latitude,
      longitude: point.longitude,
      kind: 'street',
    });
  }
  return places;
}

export function searchHousesOnStreet(street: string): Place[] {
  const wanted = streetKey(street);
  if (wanted.length < 2) {
    return [];
  }
  const found = new Map<string, HousePoint>();
  for (const [name, group] of streetIndex()) {
    if (!matchesStreet(name, street) && streetKey(name) !== wanted) {
      continue;
    }
    group.forEach(house => {
      if (!house.house) {
        return;
      }
      const key = house.house.toLowerCase();
      const previous = found.get(key);
      if (!previous || (house.entrance && !previous.entrance)) {
        found.set(key, house);
      }
    });
  }
  return Array.from(found.values())
    .sort((left, right) => houseOrder(left.house) - houseOrder(right.house))
    .slice(0, 40)
    .map(house => {
      const door = nearestEntrance(house);
      return {
        id: `house-${door.latitude.toFixed(5)}:${door.longitude.toFixed(5)}:${door.house}`,
        name: [door.street, door.house, door.entrance && door.entrance !== 'yes' ? `під'їзд ${door.entrance}` : null, door.city]
          .filter(part => part && part.length > 0)
          .join(', '),
        latitude: door.latitude,
        longitude: door.longitude,
        kind: 'house' as const,
      };
    });
}

function houseOrder(value: string): number {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
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
  const door = nearestEntrance(best);
  return {
    ...place,
    kind: 'house',
    latitude: door.latitude,
    longitude: door.longitude,
    name: [door.street, door.house, door.entrance && door.entrance !== 'yes' ? `під'їзд ${door.entrance}` : null, door.city]
      .filter(part => part && part.length > 0)
      .join(', '),
  };
}

function nearestEntrance(house: HousePoint): HousePoint {
  const session = useSessionStore.getState();
  const fromLat = session.displayLatitude;
  const fromLon = session.displayLongitude;
  const doors = housesNear(house.latitude, house.longitude, 0.00045).filter(
    item =>
      sameHouse(item.house, house.house) &&
      (matchesStreet(item.street, house.street) || streetKey(item.street) === streetKey(house.street)) &&
      item.entrance,
  );
  if (doors.length === 0) {
    return house;
  }
  const main = doors.find(item => item.entrance === 'main');
  if (fromLat == null || fromLon == null) {
    return main ?? doors[0];
  }
  let best = main ?? doors[0];
  let bestM = haversineMeters(fromLat, fromLon, best.latitude, best.longitude);
  doors.forEach(item => {
    const away = haversineMeters(fromLat, fromLon, item.latitude, item.longitude);
    if (away < bestM) {
      best = item;
      bestM = away;
    }
  });
  return best;
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
  found.push(...attachOrphanEntrances(elements, found));
  return dedupeHouses(collapseNamedStreets(found));
}

function collapseNamedStreets(points: HousePoint[]): HousePoint[] {
  const named = new Set<string>();
  return points.filter(point => {
    if (point.house) {
      return true;
    }
    const key = streetKey(point.street);
    if (!key || named.has(key)) {
      return false;
    }
    named.add(key);
    return true;
  });
}

function attachOrphanEntrances(elements: OverpassElement[], houses: HousePoint[]): HousePoint[] {
  const numbered = houses.filter(item => item.house.length > 0 && !item.entrance);
  if (numbered.length === 0) {
    return [];
  }
  const cell = 0.0004;
  const cells = new Map<string, HousePoint[]>();
  for (const house of numbered) {
    const key = `${Math.floor(house.latitude / cell)}:${Math.floor(house.longitude / cell)}`;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(house);
    } else {
      cells.set(key, [house]);
    }
  }
  const extras: HousePoint[] = [];
  elements.forEach(element => {
    const tags = element.tags ?? {};
    if (!tags.entrance) {
      return;
    }
    if (tags['addr:street'] && (tags['addr:housenumber'] || tags.ref)) {
      return;
    }
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude == null || longitude == null) {
      return;
    }
    let best: HousePoint | null = null;
    let bestM = 42;
    const lat0 = Math.floor(latitude / cell);
    const lon0 = Math.floor(longitude / cell);
    for (let latStep = -1; latStep <= 1; latStep += 1) {
      for (let lonStep = -1; lonStep <= 1; lonStep += 1) {
        const bucket = cells.get(`${lat0 + latStep}:${lon0 + lonStep}`);
        if (!bucket) {
          continue;
        }
        for (const house of bucket) {
          const away = haversineMeters(latitude, longitude, house.latitude, house.longitude);
          if (away < bestM) {
            best = house;
            bestM = away;
          }
        }
      }
    }
    if (!best) {
      return;
    }
    extras.push({
      street: best.street,
      house: best.house,
      city: best.city,
      latitude,
      longitude,
      entrance: tags.entrance || tags.ref || 'yes',
    });
  });
  return extras;
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
  const namedWay = tags.name && tags.highway ? tags.name : '';
  const street = tags['addr:street'] ?? namedWay;
  const house = tags['addr:housenumber'] ?? (tags.entrance ? tags.ref || tags['addr:unit'] || '' : '');
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!street || latitude == null || longitude == null) {
    return null;
  }
  if (!house && !namedWay) {
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
    entrance: tags.entrance || (house && tags.ref) || undefined,
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
