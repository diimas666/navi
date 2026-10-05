import type {LaneHint, RoutePlan, RouteStep} from '../../models/domain';
import {haversineMeters, projectOntoSegment} from '../../utils/geo';
import type {ResolvedLanguage} from '../../i18n/settingsCopy';

export type ManeuverTurn = 'left' | 'right' | 'straight' | 'uturn' | 'arrive';

export type ManeuverCue = {
  meters: number;
  title: string;
  turn: ManeuverTurn;
  street: string;
  lanes: LaneHint[];
};

export type ManeuverPair = {
  current: ManeuverCue;
  after: ManeuverCue | null;
};

const words = {
  uk: {
    arrived: 'Ви на місці',
    roundabout: 'Кільце',
    exit: (n: number) => `${n}-й зʼїзд`,
    uturn: 'Розворот',
    fork: 'Розвилка',
    straight: 'Прямо',
    turn: 'Поворот',
    left: 'ліворуч',
    right: 'праворуч',
    then: 'потім',
  },
  ru: {
    arrived: 'Вы на месте',
    roundabout: 'Кольцо',
    exit: (n: number) => `${n}-й съезд`,
    uturn: 'Разворот',
    fork: 'Развилка',
    straight: 'Прямо',
    turn: 'Поворот',
    left: 'налево',
    right: 'направо',
    then: 'затем',
  },
};

export function nextCue(
  route: RoutePlan,
  latitude: number,
  longitude: number,
  language: ResolvedLanguage = 'uk',
): ManeuverCue {
  return nextCues(route, latitude, longitude, language).current;
}

export function nextCues(
  route: RoutePlan,
  latitude: number,
  longitude: number,
  language: ResolvedLanguage = 'uk',
): ManeuverPair {
  const text = words[language];
  const progress = progressAlong(route.coordinates, latitude, longitude);
  const remaining = Math.max(0, route.distanceM - progress);
  const ahead = route.steps.filter(step => step.kind !== 'depart' && (step.alongM ?? 0) > progress + 12);
  const first = ahead[0];
  const second = ahead[1];
  if (remaining < 28) {
    return {current: arriveCue(remaining, text.arrived), after: null};
  }
  if (!first) {
    return {current: straightCue(remaining, text.straight, currentStreet(route, progress)), after: null};
  }
  const meters = Math.max(0, (first.alongM ?? remaining) - progress);
  const current = stepCue(first, meters, text);
  const after = second
    ? stepCue(second, Math.max(0, (second.alongM ?? remaining) - progress), text)
    : null;
  return {current, after};
}

export function progressAlong(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
): number {
  return progressOnLine(coordinates, latitude, longitude).alongM;
}

export function remainingCoordinates(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
): Array<[number, number]> {
  if (coordinates.length < 2) {
    return coordinates;
  }
  const hit = progressOnLine(coordinates, latitude, longitude);
  const rest = coordinates.slice(hit.index + 1);
  const start: [number, number] = [hit.longitude, hit.latitude];
  if (rest.length === 0) {
    const end = coordinates[coordinates.length - 1];
    return end ? [start, end] : [start];
  }
  const next = rest[0];
  if (next && haversineMeters(hit.latitude, hit.longitude, next[1], next[0]) < 4) {
    return rest;
  }
  return [start, ...rest];
}

export function currentStreet(route: RoutePlan, progressM: number, generic = ''): string {
  let name = '';
  for (const step of route.steps) {
    if ((step.alongM ?? 0) > progressM + 8) {
      break;
    }
    const label = step.name.trim();
    if (label && label !== generic) {
      name = label;
    }
  }
  return name;
}

function progressOnLine(
  coordinates: Array<[number, number]>,
  latitude: number,
  longitude: number,
): {alongM: number; index: number; latitude: number; longitude: number} {
  let bestOff = Infinity;
  let bestAlong = 0;
  let bestIndex = 0;
  let bestLat = latitude;
  let bestLon = longitude;
  let along = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lonA, latA] = coordinates[index - 1];
    const [lonB, latB] = coordinates[index];
    const segment = haversineMeters(latA, lonA, latB, lonB);
    const hit = projectOntoSegment(latitude, longitude, latA, lonA, latB, lonB);
    if (hit.distanceM < bestOff) {
      bestOff = hit.distanceM;
      bestAlong = along + haversineMeters(latA, lonA, hit.latitude, hit.longitude);
      bestIndex = index - 1;
      bestLat = hit.latitude;
      bestLon = hit.longitude;
    }
    along += segment;
  }
  return {alongM: bestAlong, index: bestIndex, latitude: bestLat, longitude: bestLon};
}

function stepCue(step: RouteStep, meters: number, text: (typeof words)['uk']): ManeuverCue {
  return {
    meters,
    title: cueTitle(step, text),
    turn: cueTurn(step),
    street: step.name.trim(),
    lanes: step.lanes ?? [],
  };
}

function arriveCue(meters: number, title: string): ManeuverCue {
  return {meters, title, turn: 'arrive', street: '', lanes: []};
}

function straightCue(meters: number, title: string, street: string): ManeuverCue {
  return {meters, title: street ? `${title} · ${street}` : title, turn: 'straight', street, lanes: []};
}

function cueTitle(step: RouteStep, text: (typeof words)['uk']): string {
  const kind = step.kind ?? '';
  const modifier = step.modifier ?? '';
  const street = step.name.trim();
  if (kind === 'arrive') {
    return text.arrived;
  }
  if (kind === 'roundabout' || kind === 'rotary' || kind === 'exit roundabout') {
    if (step.exit && step.exit > 0) {
      return street ? `${text.exit(step.exit)} · ${street}` : text.exit(step.exit);
    }
    return street ? `${text.roundabout} · ${street}` : text.roundabout;
  }
  if (kind === 'uturn' || modifier === 'uturn') {
    return text.uturn;
  }
  const side = sideWord(modifier, text);
  if (kind === 'fork' || kind === 'end of road') {
    const fork = side ? `${text.fork} ${side}` : text.fork;
    return street ? `${fork} · ${street}` : fork;
  }
  if (modifier === 'straight' || kind === 'continue' || kind === 'new name') {
    return street ? `${text.straight} · ${street}` : text.straight;
  }
  if (side) {
    return street ? `${side[0]?.toUpperCase()}${side.slice(1)} · ${street}` : `${text.turn} ${side}`;
  }
  return street || text.straight;
}

function cueTurn(step: RouteStep): ManeuverTurn {
  const kind = step.kind ?? '';
  const modifier = step.modifier ?? '';
  if (kind === 'arrive') {
    return 'arrive';
  }
  if (kind === 'uturn' || modifier === 'uturn') {
    return 'uturn';
  }
  if (modifier.includes('left')) {
    return 'left';
  }
  if (modifier.includes('right')) {
    return 'right';
  }
  return 'straight';
}

function sideWord(modifier: string, text: (typeof words)['uk']): string {
  if (modifier.includes('left')) {
    return text.left;
  }
  if (modifier.includes('right')) {
    return text.right;
  }
  return '';
}
