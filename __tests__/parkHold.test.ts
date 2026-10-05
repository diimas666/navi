import {decidePark, type ParkInput, type ParkMemory} from '../src/services/navigation/parkHold';

const memory: ParkMemory = {stillSince: 0, anchorLatitude: null, anchorLongitude: null};

function stopped(patch: Partial<ParkInput> = {}): ParkInput {
  return {
    now: 10_000,
    navigationActive: false,
    autoLock: true,
    autoUnlockGps: true,
    locked: false,
    manualLock: false,
    lockLatitude: null,
    lockLongitude: null,
    latitude: 50.45,
    longitude: 30.52,
    hasSpeed: true,
    speedMps: 0,
    speedSource: 'obd',
    engineRunning: true,
    ...patch,
  };
}

test('a traffic light keeps the point without a parking lock', () => {
  const first = decidePark(stopped({navigationActive: true}), memory);
  expect(first.action).toBe('anchor');
  const later = decidePark(stopped({navigationActive: true, now: 400_000, engineRunning: true}), first.memory);
  expect(later.action).toBe('anchor');
  expect(later.latitude).toBe(first.latitude);
});

test('OBD or phone sensors release the point as soon as the car rolls', () => {
  const held = decidePark(stopped({navigationActive: true}), memory);
  const obd = decidePark(stopped({navigationActive: true, speedMps: 0.5, speedSource: 'obd'}), held.memory);
  expect(obd.action).toBe('follow');
  const jammed = decidePark(
    stopped({navigationActive: true, speedMps: 0.5, speedSource: 'inertial', engineRunning: null}),
    held.memory,
  );
  expect(jammed.action).toBe('follow');
});

test('engine off parks, a running engine in a jam does not', () => {
  const began = decidePark(stopped({engineRunning: false, navigationActive: false}), memory);
  expect(began.action).toBe('anchor');
  const parked = decidePark(stopped({engineRunning: false, now: began.memory.stillSince + 26_000}), began.memory);
  expect(parked.action).toBe('lock');
  const jam = decidePark(stopped({engineRunning: true, now: 700_000}), memory);
  expect(jam.action).toBe('anchor');
});

test('slow GPS does not skip the parking delay', () => {
  const began = decidePark(stopped({engineRunning: false, speedSource: 'gps', speedMps: 0}), memory);
  const creep = decidePark(
    stopped({engineRunning: false, speedSource: 'gps', speedMps: 0.5, now: began.memory.stillSince + 2_000}),
    began.memory,
  );
  expect(creep.action).not.toBe('lock');
  expect(creep.memory.stillSince).toBe(began.memory.stillSince);
});

test('without rpm a long stop outside a trip parks, and GPS creep does not', () => {
  const began = decidePark(stopped({engineRunning: null, speedSource: 'gps', speedMps: 0}), memory);
  const parked = decidePark(
    stopped({engineRunning: null, speedSource: 'gps', speedMps: 0, now: began.memory.stillSince + 181_000}),
    began.memory,
  );
  expect(parked.action).toBe('lock');
  const creep = decidePark(stopped({locked: true, speedSource: 'gps', speedMps: 0.5, engineRunning: null}), parked.memory);
  expect(creep.action).toBe('hold');
});
