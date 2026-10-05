import {uiCopy} from '../../i18n/uiCopy';
import type {Place} from '../../models/domain';
import {useSessionStore} from '../../store/sessionStore';
import {useSettingsStore} from '../../store/settingsStore';
import {haversineMeters} from '../../utils/geo';
import {routingGraph} from '../roads/RegionGraph';
import {AppError} from '../errors/AppError';
import {searchDownloadedHouses} from './houses';
import {placeFix} from '../navigation/placeFix';
import {matchesStreet, normalizeAddress, parseAddress, queryVariants, sameHouse, streetKey, wantedHouse} from './addressQuery';

type Bias = {latitude: number; longitude: number};

const aliases: Record<string, string[]> = {
  kyiv: ['киев', 'kyiv', 'kiev'],
  odesa: ['одесса', 'odessa', 'odesa'],
  lviv: ['львов', 'lviv', 'lvov'],
  kharkiv: ['харьков', 'kharkiv', 'kharkov'],
  dnipro: ['днепр', 'dnipro', 'dnepr'],
};

export function searchPlaces(query: string): Place[] {
  const houses = searchDownloadedHouses(query);
  if (houses.length > 0) {
    return houses;
  }
  const street = parseAddress(query).street || query;
  const needle = streetKey(street);
  if (needle.length < 2 || wantedHouse(query)) {
    if (needle.length < 2) {
      return [];
    }
  } else {
    const cities = routingGraph()
      .nodes.filter(node => node.kind === 'city' || node.kind === 'poi')
      .filter(node => {
        const names = [node.name, ...(aliases[node.id] ?? [])];
        return names.some(name => closeEnough(needle, streetKey(name)));
      })
      .slice(0, 8)
      .map(node => ({
        id: node.id,
        name: node.name,
        latitude: node.lat,
        longitude: node.lon,
        kind: node.kind,
      }));
    if (cities.length > 0) {
      return cities;
    }
  }
  const seen = new Set<string>();
  const streets: Place[] = [];
  routingGraph().edges.forEach(edge => {
    if (streets.length >= 8 || !edge.name || edge.name === edge.highway || seen.has(edge.name)) {
      return;
    }
    if (!matchesStreet(edge.name, query)) {
      return;
    }
    seen.add(edge.name);
    const [longitude, latitude] = edge.coordinates[0] ?? [0, 0];
    streets.push({
      id: edge.id,
      name: edge.name,
      latitude,
      longitude,
      kind: 'street',
    });
  });
  return streets;
}

export function orderPlaces(places: Place[], bias: Bias | null, query = ''): Place[] {
  const distance = (place: Place) =>
    bias ? haversineMeters(bias.latitude, bias.longitude, place.latitude, place.longitude) : Number.POSITIVE_INFINITY;
  const unique: Place[] = [];
  const seen = new Map<string, number>();
  [...places]
    .sort((left, right) => distance(left) - distance(right))
    .forEach(place => {
      const key = `${place.name.trim().toLowerCase()}|${(place.detail ?? '').trim().toLowerCase()}`;
      const closer = seen.get(key);
      if (closer != null && closer <= distance(place)) {
        return;
      }
      if (closer == null) {
        seen.set(key, distance(place));
        unique.push(place);
        return;
      }
      const index = unique.findIndex(
        item => `${item.name.trim().toLowerCase()}|${(item.detail ?? '').trim().toLowerCase()}` === key,
      );
      if (index >= 0) {
        unique[index] = place;
        seen.set(key, distance(place));
      }
    });
  const ranked = [...unique].sort((left, right) => distance(left) - distance(right));
  const concrete = wantedHouse(query)
    ? ranked.filter(place => place.kind === 'house' || place.kind === 'street')
    : ranked;
  const named = concrete.filter(place => queryNamesSettlement(query, settlementOf(place)));
  const pool = named.length > 0 ? named : sameTown(concrete, bias, distance);
  if (wantedHouse(query)) {
    const houses = pool.filter(place => place.kind === 'house');
    return (houses.length > 0 ? houses : pool).slice(0, 8);
  }
  const streets = pool.filter(place => place.kind === 'street');
  return (streets.length > 0 ? streets : pool).slice(0, 8);
}

export function suggestPlacesNow(query: string): Place[] {
  return orderPlaces(searchPlaces(query), viewerBias(), query);
}

export async function suggestPlaces(query: string): Promise<Place[]> {
  const local = searchPlaces(query);
  const bias = viewerBias();
  if (query.trim().length < 2) {
    return orderPlaces(local, bias, query);
  }
  try {
    const remote = await searchPlacesOnline(query);
    return orderPlaces([...remote, ...local], bias, query);
  } catch {
    return orderPlaces(local, bias, query);
  }
}

function settlementOf(place: Place): string {
  if (place.detail && place.detail.trim().length > 2) {
    return normalizeAddress(place.detail);
  }
  const parts = place.name
    .split(',')
    .map(part => normalizeAddress(part))
    .filter(part => part.length > 2 && !/^\d/.test(part));
  return parts[parts.length - 1] ?? '';
}

function queryNamesSettlement(query: string, settlement: string): boolean {
  if (settlement.length < 4) {
    return false;
  }
  const town = streetKey(settlement);
  if (town.length < 4) {
    return false;
  }
  return streetKey(query).split(' ').includes(town);
}

function sameTown(
  ranked: Place[],
  bias: Bias | null,
  distance: (place: Place) => number,
): Place[] {
  if (!bias) {
    return ranked;
  }
  const nearby = ranked.filter(place => distance(place) <= 50000);
  if (nearby.length > 0) {
    return nearby;
  }
  return ranked.slice(0, 8);
}

export async function searchPlacesOnline(query: string): Promise<Place[]> {
  const wanted = wantedHouse(query);
  const bias = viewerBias();
  if (!wanted) {
    try {
      const streets = await photonSearch(streetQuery(query), bias, 'street');
      const ranked = orderPlaces(
        streets.filter(place => place.kind === 'street' && matchesStreet(place.name, query)),
        bias,
        query,
      );
      if (ranked.length > 0) {
        return ranked;
      }
    } catch {
      // A street-only lookup can fail. The general search still runs.
    }
  }
  const found: Place[] = [];
  const seen = new Set<string>();
  for (const variant of queryVariants(query)) {
    let batch: Place[] = [];
    try {
      batch = await photonSearch(variant, bias);
    } catch {
      continue;
    }
    batch.forEach(place => {
      if (seen.has(place.id) || !acceptsHouse(place, query, wanted)) {
        return;
      }
      seen.add(place.id);
      found.push(place);
    });
    const closeHouse = found.some(place => place.kind === 'house' && houseIsClose(place, bias));
    if (closeHouse) {
      break;
    }
  }
  return orderPlaces(found, bias, query);
}

function insideUkraine(latitude: number, longitude: number): boolean {
  return latitude >= 44.2 && latitude <= 52.4 && longitude >= 22.1 && longitude <= 40.3;
}

function houseIsClose(place: Place, bias: Bias | null): boolean {
  if (!bias) {
    return true;
  }
  return haversineMeters(bias.latitude, bias.longitude, place.latitude, place.longitude) < 20000;
}

function viewerBias(): Bias | null {
  const latitude = useSessionStore.getState().displayLatitude;
  const longitude = useSessionStore.getState().displayLongitude;
  if (latitude == null || longitude == null) {
    return null;
  }
  const stood = placeFix(latitude, longitude);
  return {latitude: stood.latitude, longitude: stood.longitude};
}

function streetQuery(query: string): string {
  const variants = queryVariants(query);
  return variants.find(variant => /[іІ]/.test(variant)) ?? variants[0] ?? query;
}

async function photonSearch(query: string, bias: Bias | null, layer?: 'street' | 'house'): Promise<Place[]> {
  const params = new URLSearchParams({limit: '12', lang: 'default', q: query});
  if (layer) {
    params.set('layer', layer);
  }
  if (bias) {
    params.set('lat', String(bias.latitude));
    params.set('lon', String(bias.longitude));
    params.set('location_bias_scale', '0.2');
  }
  const url = `https://photon.komoot.io/api/?${params.toString()}`;
  const response = await fetch(url, {
    headers: {Accept: 'application/json', 'User-Agent': 'Navi/1.0 (offline navigator for Ukraine)'},
  });
  if (!response.ok) {
    throw new AppError('MAP_ERROR', `Photon ${response.status}`, uiCopy(useSettingsStore.getState().language).searchFailed);
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const features = (payload as {features?: unknown[]}).features;
  if (!Array.isArray(features)) {
    return [];
  }
  return features.flatMap(feature => {
    if (!feature || typeof feature !== 'object') {
      return [];
    }
    const record = feature as {
      geometry?: {coordinates?: [number, number]};
      properties?: {
        osm_id?: number;
        osm_type?: string;
        osm_key?: string;
        osm_value?: string;
        type?: string;
        countrycode?: string;
        name?: string;
        street?: string;
        housenumber?: string;
        city?: string;
        town?: string;
        village?: string;
        district?: string;
      };
    };
    const coordinates = record.geometry?.coordinates;
    const props = record.properties;
    if (!coordinates || !props || props.countrycode !== 'UA') {
      return [];
    }
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !insideUkraine(latitude, longitude)) {
      return [];
    }
    const city = props.city || props.town || props.village || props.district;
    const house = props.housenumber;
    const street = props.type === 'street' || props.osm_key === 'highway';
    if (house) {
      const line = props.street || props.name;
      if (!line) {
        return [];
      }
      return [
        {
          id: `osm-${props.osm_type ?? 'x'}-${props.osm_id ?? line}-${house}`,
          name: [line, house].filter(item => item && item.length > 0).join(', '),
          detail: city,
          latitude,
          longitude,
          kind: 'house',
        },
      ];
    }
    if (street) {
      const line = props.name || props.street;
      if (!line) {
        return [];
      }
      return [
        {
          id: `osm-${props.osm_type ?? 'x'}-${props.osm_id ?? line}`,
          name: streetTitle(line),
          detail: city,
          latitude,
          longitude,
          kind: 'street',
        },
      ];
    }
    const title = props.name;
    if (!title) {
      return [];
    }
    return [
      {
        id: `osm-${props.osm_type ?? 'x'}-${props.osm_id ?? title}`,
        name: title,
        detail: [props.street, city].filter(item => item && item.length > 0).join(', '),
        latitude,
        longitude,
        kind: 'poi',
      },
    ];
  });
}

function streetTitle(name: string): string {
  const trimmed = name.trim().replace(/^(вул|ул)\.?\s+/i, '');
  if (/вулиця|улица|проспект|провулок|переулок|бульвар|площа|майдан|шосе|набережна|алея|узвіз/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} вулиця`;
}

function acceptsHouse(place: Place, query: string, wanted: string | null): boolean {
  const [street, house] = place.name.split(', ');
  if (!matchesStreet(street ?? '', query)) {
    return false;
  }
  if (!wanted || place.kind !== 'house') {
    return true;
  }
  return sameHouse(house, wanted);
}

function closeEnough(needle: string, name: string): boolean {
  if (name.length < 4 || needle.length < 4) {
    return false;
  }
  const shorter = Math.min(name.length, needle.length);
  const longer = Math.max(name.length, needle.length);
  if ((name.includes(needle) || needle.includes(name)) && shorter / longer >= 0.67) {
    return true;
  }
  return editDistance(needle, name) <= (needle.length >= 8 ? 2 : 1);
}

function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 2) {
    return 9;
  }
  const rows = Array.from({length: left.length + 1}, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) {
    rows[0][column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      );
    }
  }
  return rows[left.length][right.length];
}
