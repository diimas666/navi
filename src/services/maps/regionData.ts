import NativeMapStore from '../../native/NativeMapStore';
import type {RoadEdge, RoadNetwork, RoadNode} from '../../models/domain';
import {useMapStore} from '../../store/mapStore';
import {haversineMeters} from '../../utils/geo';
import {setAreaNetwork, setCorridorNetwork} from '../roads/RegionGraph';
import {matchesStreet, wantedHouse} from './addressQuery';
import {addPrimedHouses, setAreaHouses, type HousePoint} from './houses';

/**
 * Region databases built by scripts/maps/region_data.py: every address and the drivable road graph
 * of a region. Only the part around the car lives in memory; search reaches the whole region.
 */
const CELL = 0.02;
const AREA_STREETS_M = 5_000;
const AREA_MAIN_M = 40_000;
const AREA_HOUSES_M = 3_000;
const AREA_RELOAD_M = 2_500;
const ENDPOINT_STREETS_M = 5_000;
const MAX_CELL_ROWS = 400;

export function regionDataName(regionId: string): string {
  return `data/${regionId}.db`;
}

type Point = {latitude: number; longitude: number};

let areaCenter: Point | null = null;
let areaLoading: Promise<void> | null = null;
const streetCatalog = new Map<string, Promise<StreetRow[]>>();

type StreetRow = {id: number; name: string; city: string; latitude: number | null; longitude: number | null};

/** Regions whose database is on the phone. */
export function dataRegionIds(): string[] {
  return Object.values(useMapStore.getState().regions)
    .filter(region => region.dataVersion != null)
    .map(region => region.id)
    .sort();
}

export function cellOf(latitude: number, longitude: number): number {
  return (Math.floor(latitude / CELL) + 5000) * 100000 + (Math.floor(longitude / CELL) + 20000);
}

/** Cell ranges covering a box, one [from, to] pair per latitude row. */
export function cellRows(south: number, west: number, north: number, east: number): Array<[number, number]> {
  const rows: Array<[number, number]> = [];
  const lat0 = Math.floor(south / CELL);
  const lat1 = Math.floor(north / CELL);
  const lon0 = Math.floor(west / CELL) + 20000;
  const lon1 = Math.floor(east / CELL) + 20000;
  for (let lat = lat0; lat <= lat1; lat += 1) {
    const base = (lat + 5000) * 100000;
    rows.push([base + lon0, base + lon1]);
  }
  return rows;
}

export function boxAround(point: Point, radiusM: number): {south: number; west: number; north: number; east: number} {
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.max(0.2, Math.cos((point.latitude * Math.PI) / 180)));
  return {
    south: point.latitude - dLat,
    north: point.latitude + dLat,
    west: point.longitude - dLon,
    east: point.longitude + dLon,
  };
}

async function rows(regionId: string, sql: string, params: unknown[]): Promise<unknown[][]> {
  const text = await NativeMapStore?.query(regionDataName(regionId), sql, JSON.stringify(params));
  if (!text) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as unknown[][]) : [];
  } catch {
    return [];
  }
}

function rangeSql(column: string, ranges: Array<[number, number]>): {sql: string; params: number[]} {
  const limited = ranges.slice(0, MAX_CELL_ROWS);
  return {
    sql: limited.map(() => `${column} BETWEEN ? AND ?`).join(' OR '),
    params: limited.flat(),
  };
}

const EDGE_COLUMNS = 'e.key, e.a, e.b, e.name, e.highway, e.oneway, e.maxspeed, e.coords';

async function edgesInBox(
  regionId: string,
  box: {south: number; west: number; north: number; east: number},
  mainOnly: boolean,
): Promise<RoadEdge[]> {
  // `main = ? AND cell BETWEEN` per range lets SQLite walk the (main, cell) key instead of scanning.
  const cells = cellRows(box.south, box.west, box.north, box.east).slice(0, MAX_CELL_ROWS);
  const terms: string[] = [];
  const params: number[] = [];
  (mainOnly ? [1] : [0, 1]).forEach(main => {
    cells.forEach(([from, to]) => {
      terms.push('(main = ? AND cell BETWEEN ? AND ?)');
      params.push(main, from, to);
    });
  });
  const found = await rows(
    regionId,
    `SELECT ${EDGE_COLUMNS} FROM edges e WHERE e.id IN (SELECT edge FROM edge_cells WHERE ${terms.join(' OR ')})`,
    params,
  );
  const edges: RoadEdge[] = [];
  for (const row of found) {
    const [key, a, b, name, highway, oneway, maxspeed, coords] = row;
    if (typeof key !== 'string' || typeof a !== 'string' || typeof b !== 'string' || typeof coords !== 'string') {
      continue;
    }
    let line: Array<[number, number]>;
    try {
      line = JSON.parse(coords) as Array<[number, number]>;
    } catch {
      continue;
    }
    if (line.length < 2) {
      continue;
    }
    edges.push({
      id: key,
      from: a,
      to: b,
      // Unnamed links stay unnamed: the banner then shows the turn instead of "primary_link".
      name: typeof name === 'string' ? name : '',
      highway: String(highway),
      coordinates: line,
      oneway: oneway === 1,
      ...(typeof maxspeed === 'number' ? {maxspeed} : null),
    });
  }
  return edges;
}

/** Junction nodes come from edge ends: the database keeps no separate node table. */
export function edgesToNetwork(edges: RoadEdge[]): RoadNetwork {
  const nodes = new Map<string, RoadNode>();
  const unique = new Map<string, RoadEdge>();
  edges.forEach(edge => {
    unique.set(edge.id, edge);
    const first = edge.coordinates[0];
    const last = edge.coordinates[edge.coordinates.length - 1];
    if (first && !nodes.has(edge.from)) {
      nodes.set(edge.from, {id: edge.from, name: '', lat: first[1], lon: first[0], kind: 'junction'});
    }
    if (last && !nodes.has(edge.to)) {
      nodes.set(edge.to, {id: edge.to, name: '', lat: last[1], lon: last[0], kind: 'junction'});
    }
  });
  return {nodes: Array.from(nodes.values()), edges: Array.from(unique.values())};
}

async function housesInBox(
  regionId: string,
  box: {south: number; west: number; north: number; east: number},
): Promise<HousePoint[]> {
  const ranges = rangeSql('h.cell', cellRows(box.south, box.west, box.north, box.east));
  const found = await rows(
    regionId,
    `SELECT s.name, h.house, s.city, h.lat, h.lon, h.entrance FROM houses h JOIN streets s ON s.id = h.street WHERE ${ranges.sql}`,
    ranges.params,
  );
  return found.map(houseFromRow).filter((house): house is HousePoint => house != null);
}

function houseFromRow(row: unknown[]): HousePoint | null {
  const [street, house, city, latitude, longitude, entrance] = row;
  if (typeof street !== 'string' || typeof house !== 'string') {
    return null;
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  return {
    street,
    house,
    city: typeof city === 'string' ? city : '',
    latitude,
    longitude,
    entrance: typeof entrance === 'string' && entrance.length > 0 ? entrance : undefined,
  };
}

export function areaMovedFar(latitude: number, longitude: number): boolean {
  return (
    areaCenter == null ||
    haversineMeters(areaCenter.latitude, areaCenter.longitude, latitude, longitude) > AREA_RELOAD_M
  );
}

/** Streets, main roads and houses around the car, from every downloaded region database. */
export function loadArea(latitude: number, longitude: number): Promise<void> {
  if (areaLoading) {
    return areaLoading;
  }
  const regionIds = dataRegionIds();
  if (regionIds.length === 0) {
    return Promise.resolve();
  }
  const center = {latitude, longitude};
  areaCenter = center;
  areaLoading = (async () => {
    const edges: RoadEdge[] = [];
    const houses: HousePoint[] = [];
    for (const regionId of regionIds) {
      edges.push(...(await edgesInBox(regionId, boxAround(center, AREA_STREETS_M), false)));
      edges.push(...(await edgesInBox(regionId, boxAround(center, AREA_MAIN_M), true)));
      houses.push(...(await housesInBox(regionId, boxAround(center, AREA_HOUSES_M))));
    }
    setAreaNetwork(edges.length > 0 ? edgesToNetwork(edges) : null);
    setAreaHouses(houses);
  })().finally(() => {
    areaLoading = null;
  });
  return areaLoading;
}

/** Main roads between the ends and every street near each end, for offline route planning. */
export async function loadCorridor(points: Point[]): Promise<void> {
  const regionIds = dataRegionIds();
  if (regionIds.length === 0 || points.length < 2) {
    setCorridorNetwork(null);
    return;
  }
  const south = Math.min(...points.map(point => point.latitude)) - 0.08;
  const north = Math.max(...points.map(point => point.latitude)) + 0.08;
  const west = Math.min(...points.map(point => point.longitude)) - 0.12;
  const east = Math.max(...points.map(point => point.longitude)) + 0.12;
  const edges: RoadEdge[] = [];
  for (const regionId of regionIds) {
    edges.push(...(await edgesInBox(regionId, {south, west, north, east}, true)));
    for (const point of points) {
      edges.push(...(await edgesInBox(regionId, boxAround(point, ENDPOINT_STREETS_M), false)));
    }
  }
  setCorridorNetwork(edges.length > 0 ? edgesToNetwork(edges) : null);
}

function streetsOf(regionId: string): Promise<StreetRow[]> {
  let pending = streetCatalog.get(regionId);
  if (!pending) {
    pending = rows(regionId, 'SELECT id, name, city, lat, lon FROM streets', []).then(found =>
      found
        .map(([id, name, city, latitude, longitude]) => ({
          id: Number(id),
          name: String(name ?? ''),
          city: String(city ?? ''),
          latitude: typeof latitude === 'number' ? latitude : null,
          longitude: typeof longitude === 'number' ? longitude : null,
        }))
        .filter(row => row.name.length > 0),
    );
    streetCatalog.set(regionId, pending);
  }
  return pending;
}

export function forgetRegionData(regionId: string): void {
  streetCatalog.delete(regionId);
  NativeMapStore?.closeDatabase(regionDataName(regionId));
}

/**
 * Puts every house of the streets the query names into memory, so the usual search finds any
 * address of the region, not only the ones around the car.
 */
export async function primeSearch(query: string): Promise<void> {
  const regionIds = dataRegionIds();
  if (regionIds.length === 0 || query.trim().length < 2) {
    return;
  }
  const houses: HousePoint[] = [];
  for (const regionId of regionIds) {
    const streets = (await streetsOf(regionId)).filter(street => matchesStreet(street.name, query)).slice(0, 40);
    if (streets.length === 0) {
      continue;
    }
    streets.forEach(street => {
      if (street.latitude != null && street.longitude != null) {
        const {name, city, latitude, longitude} = street;
        houses.push({street: name, house: '', city, latitude, longitude});
      }
    });
    if (!wantedHouse(query)) {
      continue;
    }
    const ids = streets.map(street => street.id);
    const found = await rows(
      regionId,
      `SELECT s.name, h.house, s.city, h.lat, h.lon, h.entrance FROM houses h JOIN streets s ON s.id = h.street WHERE h.street IN (${ids
        .map(() => '?')
        .join(',')})`,
      ids,
    );
    found.forEach(row => {
      const house = houseFromRow(row);
      if (house) {
        houses.push(house);
      }
    });
  }
  addPrimedHouses(houses);
}
