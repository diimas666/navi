import districtsFile from '../../assets/places/districts.json';

type DistrictRow = {
  region: string;
  name: string;
  lat: number;
  lon: number;
};

const rows = districtsFile as DistrictRow[];

const ALSO_SHOW_FOR: Record<string, string[]> = {
  kyiv: ['kyiv-oblast'],
};

export function districtFeatures(downloadedIds: string[]) {
  const downloaded = new Set(downloadedIds);
  const features = rows
    .filter(row => {
      if (downloaded.has(row.region)) {
        return true;
      }
      return (ALSO_SHOW_FOR[row.region] ?? []).some(id => downloaded.has(id));
    })
    .map(row => ({
      type: 'Feature' as const,
      properties: {name: row.name},
      geometry: {type: 'Point' as const, coordinates: [row.lon, row.lat]},
    }));
  if (features.length === 0) {
    return null;
  }
  return {type: 'FeatureCollection' as const, features};
}
