import {BUILDING_LAYER_IDS, buildingLayerVisibility} from '../src/services/maps/mapLayers';
import {missingRegionsAlong, needDownloadView} from '../src/services/maps/regionCoverage';
import {useMapStore} from '../src/store/mapStore';

beforeEach(() => {
  useMapStore.setState({regions: {}});
});

test('a downloading region still counts as missing on the route', () => {
  useMapStore.getState().patchRegion('odesa', {status: 'downloading', progress: 0.5, detail: 'вулиці 132/256'});
  const missing = missingRegionsAlong([
    [30.73, 46.48],
    [30.68, 46.43],
  ]);
  expect(missing.map(region => region.id)).toEqual(['odesa']);
});

test('the banner shows percent and tile counts while a region downloads', () => {
  const view = needDownloadView(['odesa'], {
    odesa: {status: 'downloading', progress: 0.52, detail: 'вулиці 132/256'},
  });
  expect(view.busy).toBe(true);
  expect(view.percent).toBe(52);
  expect(view.detail).toBe('вулиці 132/256');
});

test('an idle missing region keeps the download button', () => {
  const view = needDownloadView(['odesa'], {});
  expect(view.busy).toBe(false);
  expect(view.percent).toBe(0);
  expect(view.detail).toBeNull();
});

test('an error is kept so the user can retry', () => {
  const view = needDownloadView(['odesa'], {
    odesa: {status: 'error', progress: 0.1, error: 'мережа'},
  });
  expect(view.busy).toBe(false);
  expect(view.error).toBe('мережа');
});

test('switching 3D never retargets a layer id', () => {
  expect(BUILDING_LAYER_IDS).toEqual(['building-3d', 'building-2d']);
  const flat = buildingLayerVisibility(false);
  const pitched = buildingLayerVisibility(true);
  expect(Object.keys(flat)).toEqual([...BUILDING_LAYER_IDS]);
  expect(Object.keys(pitched)).toEqual([...BUILDING_LAYER_IDS]);
  expect(flat['building-3d']).toBe('none');
  expect(flat['building-2d']).toBe('visible');
  expect(pitched['building-3d']).toBe('visible');
  expect(pitched['building-2d']).toBe('none');
});
