export const BUILDING_LAYER_IDS = ['building-3d', 'building-2d'] as const;

export function buildingLayerVisibility(pitched: boolean): {
  'building-3d': 'visible' | 'none';
  'building-2d': 'visible' | 'none';
} {
  return {
    'building-3d': pitched ? 'visible' : 'none',
    'building-2d': pitched ? 'none' : 'visible',
  };
}
