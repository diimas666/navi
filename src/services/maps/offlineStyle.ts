import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

/** Online OpenMapTiles source of the OpenFreeMap styles. Downloaded regions sit on top of it. */
export const REMOTE_SOURCE = 'openmaptiles';
const REGION_PREFIX = 'omt-';

export function regionSourceId(regionId: string): string {
  return `${REGION_PREFIX}${regionId}`;
}

export function regionFileName(regionId: string): string {
  return `maps/${regionId}.pmtiles`;
}

/** Glyph files are saved without spaces, so `file://` glyph URLs need no escaping. */
export function localFontName(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

export function localFontStack(stack: string[]): string[] {
  return stack.map(localFontName);
}

/** Vector sources that carry OpenMapTiles layers: the online one and every downloaded region. */
export function tileSources(style: StyleSpecification | string): string[] {
  if (typeof style === 'string') {
    return [REMOTE_SOURCE];
  }
  return Object.keys(style.sources).filter(id => id === REMOTE_SOURCE || id.startsWith(REGION_PREFIX));
}

export function usesLocalGlyphs(style: StyleSpecification | string): boolean {
  return typeof style !== 'string' && typeof style.glyphs === 'string' && style.glyphs.startsWith('file://');
}

/**
 * Every OpenMapTiles layer is drawn once per source: online first, then each downloaded region.
 * Offline the online copy loads nothing and the region files draw the map. Glyphs and sprites
 * come from the maps folder, so labels and icons stay without network.
 */
export function buildLocalStyle(
  base: StyleSpecification,
  directory: string,
  regionIds: string[],
): StyleSpecification {
  const root = `file://${directory.replace(/\/$/, '')}`;
  const sources: StyleSpecification['sources'] = {...base.sources};
  regionIds.forEach(regionId => {
    sources[regionSourceId(regionId)] = {
      type: 'vector',
      url: `pmtiles://${root}/${regionFileName(regionId)}`,
    };
  });
  const layers: StyleSpecification['layers'] = [];
  base.layers.forEach(layer => {
    const local = withLocalFonts(layer);
    layers.push(local);
    if (!('source' in local) || local.source !== REMOTE_SOURCE) {
      return;
    }
    regionIds.forEach(regionId => {
      layers.push({...local, id: `${local.id}@${regionId}`, source: regionSourceId(regionId)} as typeof local);
    });
  });
  return {
    ...base,
    glyphs: `${root}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${root}/sprites/ofm`,
    sources,
    layers,
  };
}

function withLocalFonts<T extends StyleSpecification['layers'][number]>(layer: T): T {
  if (layer.type !== 'symbol' || !layer.layout) {
    return layer;
  }
  const font = (layer.layout as {'text-font'?: unknown})['text-font'];
  if (!Array.isArray(font) || !font.every(name => typeof name === 'string')) {
    return layer;
  }
  return {...layer, layout: {...layer.layout, 'text-font': localFontStack(font as string[])}};
}
