import cityFile from '../../assets/places/cityDistricts.json';
import districtsFile from '../../assets/places/districts.json';

type DistrictRow = {
  region: string;
  name: string;
  lat: number;
  lon: number;
};

type CityDistrictRow = {
  city: string;
  name: string;
  lat: number;
  lon: number;
};

const rows = districtsFile as DistrictRow[];
const cityRows = cityFile as CityDistrictRow[];

/** Neighbourhoods such as Moldavanka. Bundled with the app, so they show without a download. */
export function districtFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: rows.map(row => ({
      type: 'Feature' as const,
      properties: {name: row.name},
      geometry: {type: 'Point' as const, coordinates: [row.lon, row.lat]},
    })),
  };
}

/** City districts in capitals, like a taxi map: PRYMORSKYI RAION, KYIVSKYI RAION. */
export function cityDistrictFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: cityRows.map(row => ({
      type: 'Feature' as const,
      properties: {name: row.name.toUpperCase()},
      geometry: {type: 'Point' as const, coordinates: [row.lon, row.lat]},
    })),
  };
}

export function districtLabels(): Array<{name: string; lat: number; lon: number}> {
  return rows.map(row => ({name: row.name, lat: row.lat, lon: row.lon}));
}

export function cityDistrictLabels(): Array<{name: string; lat: number; lon: number}> {
  return cityRows.map(row => ({name: row.name.toUpperCase(), lat: row.lat, lon: row.lon}));
}
