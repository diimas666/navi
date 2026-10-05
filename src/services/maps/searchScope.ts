import {coveringRegion, downloadedRegionIds, regionsAt} from './regionCoverage';

export type SearchScope = {
  coveringName: string | null;
  hasLocalMap: boolean;
  needsNetwork: boolean;
};

export function searchScope(
  latitude: number | null,
  longitude: number | null,
  online: boolean,
): SearchScope {
  if (latitude == null || longitude == null) {
    return {coveringName: null, hasLocalMap: downloadedRegionIds().size > 0, needsNetwork: !online};
  }
  const covering = coveringRegion(latitude, longitude);
  const nearby = regionsAt(latitude, longitude).length > 0;
  return {
    coveringName: covering?.name ?? null,
    hasLocalMap: covering != null,
    needsNetwork: !online && covering == null && nearby,
  };
}

export function searchEmptyHint(
  scope: SearchScope,
  copy: {searchEmpty: string; searchEmptyRegion: string; searchNeedNet: string},
): string {
  if (scope.coveringName) {
    return copy.searchEmptyRegion.replace('{region}', scope.coveringName);
  }
  if (scope.needsNetwork) {
    return copy.searchNeedNet;
  }
  return copy.searchEmpty;
}

export function searchLiveHint(
  scope: SearchScope,
  copy: {searchInRegion: string; searchNeedNet: string},
): string | null {
  if (scope.coveringName) {
    return copy.searchInRegion.replace('{region}', scope.coveringName);
  }
  if (scope.needsNetwork) {
    return copy.searchNeedNet;
  }
  return null;
}
