export type TrustLevel = 'trusted' | 'degraded' | 'untrusted' | 'lost';

export type PositionSource = 'gps' | 'dr' | 'blended' | 'held' | 'none';

export type SpeedSource = 'obd' | 'gps' | 'none';

export type SensorQuality = 'good' | 'weak' | 'none';

export type RoadNode = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: 'city' | 'junction' | 'poi';
};

export type RoadEdge = {
  id: string;
  from: string;
  to: string;
  name: string;
  highway: string;
  coordinates: Array<[number, number]>;
  oneway?: boolean;
};

export type RoadNetwork = {
  nodes: RoadNode[];
  edges: RoadEdge[];
};

export type RouteStep = {
  name: string;
  distanceM: number;
  alongM?: number;
  latitude?: number;
  longitude?: number;
  coordinates?: Array<[number, number]>;
  kind?: string;
  modifier?: string;
};

export type RoutePlan = {
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
  coordinates: Array<[number, number]>;
  via?: 'street' | 'graph';
};

export type TripRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  gpsDistanceM: number;
  drDistanceM: number;
  maxSpeedMps: number;
  track: Array<{latitude: number; longitude: number; source: string}>;
  fromName?: string;
  toName?: string;
  roads?: string[];
};

export type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: string;
  detail?: string;
  /** Google place id. Coordinates are NaN until the driver taps the row. */
  placeId?: string;
  /** Distance from the driver, when the search service already knows it. */
  distanceM?: number;
};
