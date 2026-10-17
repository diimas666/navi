import {haversineMeters} from '../../utils/geo';

/** Saved houses and streets can exceed the memory caps. Tiles around this point load first. */
const RELOAD_AFTER_M = 40_000;

type Point = {latitude: number; longitude: number};

let center: Point | null = null;

export function setLoadCenter(point: Point | null): void {
  center = point;
}

export function loadCenter(): Point | null {
  return center;
}

export function centerMovedFar(latitude: number, longitude: number): boolean {
  return center == null || haversineMeters(center.latitude, center.longitude, latitude, longitude) > RELOAD_AFTER_M;
}

/** Tile ids are `south_west_north_east` in thousandths of a degree. */
export function tileIdCenter(id: string): Point | null {
  const parts = id.split('_').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) {
    return null;
  }
  const [south, west, north, east] = parts;
  return {latitude: (south + north) / 2000, longitude: (west + east) / 2000};
}

export function nearestTilesFirst<T extends {id: string}>(tiles: T[], point = center): T[] {
  if (!point) {
    return tiles;
  }
  const gap = (tile: T) => {
    const middle = tileIdCenter(tile.id);
    return middle
      ? haversineMeters(point.latitude, point.longitude, middle.latitude, middle.longitude)
      : Number.POSITIVE_INFINITY;
  };
  return tiles
    .map(tile => ({tile, gap: gap(tile)}))
    .sort((left, right) => left.gap - right.gap)
    .map(item => item.tile);
}
