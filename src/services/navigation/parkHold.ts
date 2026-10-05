const CRAWL_MPS = 0.45;
const GPS_ROLL_MPS = 0.8;
const ENGINE_OFF_MS = 25_000;
const UNKNOWN_PARK_MS = 180_000;

export type ParkMemory = {
  stillSince: number;
  anchorLatitude: number | null;
  anchorLongitude: number | null;
};

export type ParkInput = {
  now: number;
  navigationActive: boolean;
  autoLock: boolean;
  autoUnlockGps: boolean;
  locked: boolean;
  manualLock: boolean;
  lockLatitude: number | null;
  lockLongitude: number | null;
  latitude: number;
  longitude: number;
  hasSpeed: boolean;
  speedMps: number;
  speedSource: string;
  engineRunning: boolean | null;
};

export type ParkAction = 'follow' | 'anchor' | 'lock' | 'unlock' | 'hold';

export type ParkDecision = {
  action: ParkAction;
  latitude: number;
  longitude: number;
  memory: ParkMemory;
};

export function decidePark(input: ParkInput, memory: ParkMemory): ParkDecision {
  const sensorMove =
    input.hasSpeed &&
    input.speedMps >= CRAWL_MPS &&
    (input.speedSource === 'obd' || input.speedSource === 'inertial');
  const gpsMove = input.hasSpeed && input.speedMps >= GPS_ROLL_MPS && input.speedSource === 'gps' && input.autoUnlockGps;
  const rolling = sensorMove || gpsMove;
  const since = rolling ? 0 : memory.stillSince || input.now;

  if (input.manualLock) {
    if (rolling) {
      return follow(input, emptyMemory());
    }
    return holdLock(input, {...memory, stillSince: since});
  }

  if (rolling) {
    const action = input.locked ? 'unlock' : 'follow';
    return {action, latitude: input.latitude, longitude: input.longitude, memory: emptyMemory()};
  }

  if (input.navigationActive || input.engineRunning === true) {
    if (input.locked) {
      return holdLock(input, {...memory, stillSince: since});
    }
    return anchor(input, memory, since);
  }

  const dwell = input.now - since;
  const engineOff = input.engineRunning === false;
  const park =
    input.autoLock && (engineOff ? dwell >= ENGINE_OFF_MS : input.engineRunning == null && dwell >= UNKNOWN_PARK_MS);
  if (park && !input.locked) {
    return {
      action: 'lock',
      latitude: input.latitude,
      longitude: input.longitude,
      memory: {stillSince: since, anchorLatitude: input.latitude, anchorLongitude: input.longitude},
    };
  }
  if (input.locked) {
    return holdLock(input, {...memory, stillSince: since});
  }
  return anchor(input, memory, since);
}

function follow(input: ParkInput, memory: ParkMemory): ParkDecision {
  return {
    action: input.locked ? 'unlock' : 'follow',
    latitude: input.latitude,
    longitude: input.longitude,
    memory,
  };
}

function holdLock(input: ParkInput, memory: ParkMemory): ParkDecision {
  return {
    action: 'hold',
    latitude: input.lockLatitude ?? input.latitude,
    longitude: input.lockLongitude ?? input.longitude,
    memory,
  };
}

function anchor(input: ParkInput, memory: ParkMemory, since: number): ParkDecision {
  const latitude = memory.anchorLatitude ?? input.latitude;
  const longitude = memory.anchorLongitude ?? input.longitude;
  return {
    action: 'anchor',
    latitude,
    longitude,
    memory: {stillSince: since, anchorLatitude: latitude, anchorLongitude: longitude},
  };
}

function emptyMemory(): ParkMemory {
  return {stillSince: 0, anchorLatitude: null, anchorLongitude: null};
}
