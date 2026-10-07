import {resolveLanguage} from '../../i18n/settingsCopy';
import {uiCopy} from '../../i18n/uiCopy';
import type {Place} from '../../models/domain';
import {useSessionStore} from '../../store/sessionStore';
import {useSettingsStore} from '../../store/settingsStore';
import {haversineMeters} from '../../utils/geo';
import {routingGraph} from '../roads/RegionGraph';
import {AppError} from '../errors/AppError';
import {searchDownloadedHouses, searchDownloadedStreets, snapPlaceToHouse} from './houses';
import {placeFix} from '../navigation/placeFix';
import {googleSearchReady, googleSuggest} from './googlePlaces';
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
  if (needle.length < 2) {
    return [];
  }
  if (!wantedHouse(query)) {
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
    if (cities.length > 0 && needle.length >= 4) {
      const exact = cities.filter(item => streetKey(item.name).startsWith(needle) || needle.startsWith(streetKey(item.name)));
      if (exact.length > 0 && needle.length >= streetKey(cities[0].name).length - 1) {
        return cities;
      }
    }
  }
  const seen = new Set<string>();
  const streets: Place[] = [];
  const pushStreet = (id: string, name: string, latitude: number, longitude: number) => {
    const key = streetKey(name);
    if (!name || seen.has(key) || !catalogHit(key, needle)) {
      return;
    }
    seen.add(key);
    streets.push({id, name, latitude, longitude, kind: 'street'});
  };
  searchDownloadedStreets(query).forEach(place => pushStreet(place.id, place.name, place.latitude, place.longitude));
  streetCatalog().forEach(item => pushStreet(`way-${item.key}`, item.name, item.lat, item.lon));
  const bias = viewerBias();
  streets.sort((left, right) => {
    const leftHit = prefixScore(streetKey(left.name), needle);
    const rightHit = prefixScore(streetKey(right.name), needle);
    if (leftHit !== rightHit) {
      return rightHit - leftHit;
    }
    if (!bias) {
      return left.name.length - right.name.length;
    }
    return (
      haversineMeters(bias.latitude, bias.longitude, left.latitude, left.longitude) -
      haversineMeters(bias.latitude, bias.longitude, right.latitude, right.longitude)
    );
  });
  return streets.slice(0, 8);
}

function catalogHit(key: string, needle: string): boolean {
  if (key.includes(needle) || needle.includes(key)) {
    return true;
  }
  return key.split(' ').some(word => word.startsWith(needle));
}

function prefixScore(key: string, needle: string): number {
  if (key.startsWith(needle)) {
    return 3;
  }
  if (key.split(' ').some(word => word.startsWith(needle))) {
    return 2;
  }
  if (key.includes(needle)) {
    return 1;
  }
  return 0;
}

let catalog: Array<{name: string; key: string; lat: number; lon: number}> | null = null;
let catalogSize = -1;

function streetCatalog(): Array<{name: string; key: string; lat: number; lon: number}> {
  const graph = routingGraph();
  if (catalog && catalogSize === graph.edges.length) {
    return catalog;
  }
  const best = new Map<string, {name: string; key: string; lat: number; lon: number}>();
  graph.edges.forEach(edge => {
    if (!edge.name || edge.name === edge.highway) {
      return;
    }
    const key = streetKey(edge.name);
    if (key.length < 3 || best.has(key)) {
      return;
    }
    const [longitude, latitude] = edge.coordinates[0] ?? [0, 0];
    best.set(key, {name: edge.name, key, lat: latitude, lon: longitude});
  });
  catalog = Array.from(best.values());
  catalogSize = graph.edges.length;
  return catalog;
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
  const namedTown = named.length > 0;
  const pool = namedTown ? named : sameTown(concrete, bias, distance);
  const wanted = wantedHouse(query);
  if (wanted) {
    const near = (place: Place) => namedTown || !bias || distance(place) <= 40000;
    const nearHouses = pool.filter(place => place.kind === 'house' && near(place));
    if (nearHouses.length > 0) {
      return nearHouses.map(place => showTypedHouse(place, wanted)).slice(0, 8);
    }
    const streets = pool.filter(place => place.kind === 'street' && near(place));
    if (streets.length > 0) {
      return streets.map(place => showTypedHouse(place, wanted)).slice(0, 8);
    }
    if (!bias) {
      const anywhere = pool.filter(place => place.kind === 'street' || place.kind === 'house');
      return anywhere.map(place => showTypedHouse(place, wanted)).slice(0, 8);
    }
    return [];
  }
  const streets = pool.filter(place => place.kind === 'street');
  return (streets.length > 0 ? streets : pool).slice(0, 8);
}

export function suggestPlacesNow(query: string): Place[] {
  return orderPlaces(searchPlaces(query), viewerBias(), query).map(place => snapPlaceToHouse(place, query));
}

/** True when the phone is not known to be offline, so Google can answer. */
export function googleSearchOn(): boolean {
  return googleSearchReady();
}

export async function suggestPlaces(query: string): Promise<Place[]> {
  const local = searchPlaces(query);
  const bias = viewerBias();
  if (query.trim().length < 2) {
    return orderPlaces(local, bias, query);
  }
  const houses = local.filter(place => place.kind === 'house').map(place => snapPlaceToHouse(place, query));
  if (houses.length > 0) {
    return orderPlaces(houses, bias, query);
  }
  const nearbyStreets = orderPlaces(
    local.filter(place => place.kind === 'street'),
    bias,
    query,
  );
  const remote: Place[] = [];
  const language = resolveLanguage(useSettingsStore.getState().language);
  const tasks: Array<Promise<Place[]>> = [];
  if (googleSearchOn()) {
    tasks.push(
      googleSuggest(query, language, bias).catch(() => [] as Place[]),
    );
  }
  if (nearbyStreets.length < 4 && !wantedHouse(query)) {
    tasks.push(
      photonSearch(streetQuery(query), bias, 'street').catch(() => [] as Place[]),
    );
  }
  if (tasks.length > 0) {
    const batches = await Promise.all(tasks);
    batches.forEach(batch => remote.push(...batch));
  }
  const usefulRemote = remote.filter(place => place.kind === 'street' || place.kind === 'house' || place.kind === 'address');
  if (nearbyStreets.length > 0) {
    return mergeStreetHits(nearbyStreets, usefulRemote.map(place => snapPlaceToHouse(place, query)), bias);
  }
  if (usefulRemote.length > 0) {
    const snapped = usefulRemote.map(place => snapPlaceToHouse(place, query));
    const ranked = orderPlaces(snapped, bias, query);
    if (ranked.length > 0) {
      return ranked;
    }
    return snapped.slice(0, 8);
  }
  try {
    const online = await searchPlacesOnline(query);
    return orderPlaces([...online, ...local], bias, query);
  } catch {
    return orderPlaces(local, bias, query);
  }
}

function mergeStreetHits(local: Place[], remote: Place[], bias: Bias | null): Place[] {
  const seen = new Set(local.map(place => streetKey(place.name)));
  const extra: Place[] = [];
  remote.forEach(place => {
    const key = streetKey(place.name);
    if (!key || seen.has(key) || place.kind === 'city') {
      return;
    }
    if (
      bias &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude) &&
      haversineMeters(bias.latitude, bias.longitude, place.latitude, place.longitude) > 40000
    ) {
      return;
    }
    seen.add(key);
    extra.push(place);
  });
  return [...local, ...extra].slice(0, 8);
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
  return ranked.filter(place => distance(place) <= 40000);
}

export async function searchPlacesOnline(query: string): Promise<Place[]> {
  const wanted = wantedHouse(query);
  const bias = viewerBias();
  const streetName = parseAddress(query).street || query;
  try {
    const streets = await photonSearch(streetQuery(streetName), bias, 'street');
    const ranked = orderPlaces(
      streets.filter(place => place.kind === 'street' && matchesStreet(place.name, query)),
      bias,
      query,
    );
    if (ranked.length > 0) {
      return ranked;
    }
  } catch {
    // The street lookup can fail. One house lookup still runs.
  }
  if (!wanted) {
    try {
      const mixed = await photonSearch(streetQuery(query), bias);
      const useful = mixed.filter(place => place.kind === 'poi' || place.kind === 'city' || place.kind === 'street');
      if (useful.length > 0) {
        return useful;
      }
    } catch {
      // Photon can miss a mall. Nominatim still has a name search.
    }
    try {
      return await nominatimSearch(query, bias);
    } catch {
      return [];
    }
  }
  try {
    const houses = await photonSearch(streetQuery(query), bias);
    return orderPlaces(
      houses.filter(place => acceptsHouse(place, query, wanted)),
      bias,
      query,
    );
  } catch {
    return [];
  }
}

function insideUkraine(latitude: number, longitude: number): boolean {
  return latitude >= 44.2 && latitude <= 52.4 && longitude >= 22.1 && longitude <= 40.3;
}

function showTypedHouse(place: Place, wanted: string): Place {
  const parts = place.name.split(', ').map(part => part.trim()).filter(part => part.length > 0);
  const street = parts[0] ?? place.name;
  const rest = parts.slice(1).filter(part => !sameHouse(part, wanted) && !/^\d/.test(normalizeAddress(part)));
  return {
    ...place,
    kind: place.kind === 'street' ? 'house' : place.kind,
    name: [street, wanted, ...rest].join(', '),
  };
}

function viewerBias(): Bias | null {
  const session = useSessionStore.getState();
  const fix = session.snapshot;
  const latitude = session.displayLatitude ?? (fix?.hasGps ? fix.latitude : null);
  const longitude = session.displayLongitude ?? (fix?.hasGps ? fix.longitude : null);
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

async function nominatimSearch(query: string, bias: Bias | null): Promise<Place[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    countrycodes: 'ua',
    limit: '8',
    addressdetails: '1',
  });
  if (bias) {
    const west = bias.longitude - 0.45;
    const east = bias.longitude + 0.45;
    const south = bias.latitude - 0.35;
    const north = bias.latitude + 0.35;
    params.set('viewbox', `${west},${north},${east},${south}`);
    params.set('bounded', '0');
  }
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {Accept: 'application/json', 'User-Agent': 'Navi/1.0 (offline navigator for Ukraine)'},
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    return [];
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as {
      lat?: string;
      lon?: string;
      osm_id?: number;
      class?: string;
      type?: string;
      name?: string;
      display_name?: string;
      address?: {city?: string; town?: string; village?: string; road?: string};
    };
    const latitude = Number(record.lat);
    const longitude = Number(record.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !insideUkraine(latitude, longitude)) {
      return [];
    }
    const title = record.name || record.display_name?.split(',')[0] || '';
    if (title.length < 2) {
      return [];
    }
    const city = record.address?.city || record.address?.town || record.address?.village;
    const road = record.class === 'highway';
    return [
      {
        id: `nom-${record.osm_id ?? title}`,
        name: title,
        detail: [record.address?.road && record.address.road !== title ? record.address.road : null, city]
          .filter(part => part && part.length > 0)
          .join(', '),
        latitude,
        longitude,
        kind: road ? 'street' : 'poi',
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
