import AsyncStorage from '@react-native-async-storage/async-storage';
import type {StyleSpecification} from '@maplibre/maplibre-gl-style-spec';

import {DARK_STYLE_URL, VECTOR_STYLE_URL} from '../../constants/map';
import {jsonTooBig, readBoundedJson} from '../jsonLimit';

const STYLE_KEY = 'neiv.basemap.style.v1';

export type BasemapMode = 'light' | 'dark';

const HIDDEN_PLACE_CLASSES = [
  'city',
  'continent',
  'country',
  'state',
  'town',
  'village',
  'suburb',
  'neighbourhood',
  'quarter',
];

const patched = new Map<BasemapMode, StyleSpecification>();
const loading = new Map<BasemapMode, Promise<StyleSpecification | null>>();

const LOCAL_NAME = ['coalesce', ['get', 'name:nonlatin'], ['get', 'name']];

function hideBasemapDistricts(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map(layer => {
    if (layer.type !== 'symbol') {
      return layer;
    }
    const layout = layer.layout;
    const field = layout && 'text-field' in layout ? JSON.stringify(layout['text-field']) : '';
    const local =
      field.includes('name:latin') || field.includes('name:nonlatin') || field.includes('name_en');
    if (layer.id !== 'label_other' && !local) {
      return layer;
    }
    return {
      ...layer,
      ...(layer.id === 'label_other'
        ? {filter: ['match', ['get', 'class'], HIDDEN_PLACE_CLASSES, false, true]}
        : null),
      ...(local && layout ? {layout: {...layout, 'text-field': LOCAL_NAME}} : null),
    };
  });
  return {...style, layers: layers as StyleSpecification['layers']};
}

export function loadBasemapStyle(mode: BasemapMode = 'light'): Promise<StyleSpecification | null> {
  const ready = patched.get(mode);
  if (ready) {
    return Promise.resolve(ready);
  }
  const pending = loading.get(mode);
  if (pending) {
    return pending.then(style => style ?? patched.get(mode) ?? null);
  }
  const next = restoreStyle(mode)
    .then(cached => {
      if (cached && !patched.has(mode)) {
        patched.set(mode, cached);
      }
      return refreshStyle(mode);
    })
    .catch(() => patched.get(mode) ?? null);
  loading.set(mode, next);
  return next.then(style => style ?? patched.get(mode) ?? null);
}

function styleKey(mode: BasemapMode): string {
  return mode === 'dark' ? `${STYLE_KEY}.dark` : STYLE_KEY;
}

function styleUrl(mode: BasemapMode): string {
  return mode === 'dark' ? DARK_STYLE_URL : VECTOR_STYLE_URL;
}

async function restoreStyle(mode: BasemapMode): Promise<StyleSpecification | null> {
  const raw = await AsyncStorage.getItem(styleKey(mode));
  if (!raw || jsonTooBig(raw, 2_000_000)) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  return parsed as StyleSpecification;
}

async function refreshStyle(mode: BasemapMode): Promise<StyleSpecification | null> {
  try {
    const response = await fetch(styleUrl(mode));
    if (!response.ok) {
      throw new Error('style');
    }
    const style = hideBasemapDistricts((await readBoundedJson(response, 2_000_000)) as StyleSpecification);
    patched.set(mode, style);
    await AsyncStorage.setItem(styleKey(mode), JSON.stringify(style));
    return style;
  } catch {
    loading.delete(mode);
    return patched.get(mode) ?? null;
  }
}
