import type {RoutePlan, RouteStep} from '../../models/domain';
import {haversineMeters, projectOntoSegment} from '../../utils/geo';
import type {ResolvedLanguage} from '../../i18n/settingsCopy';

export type ManeuverTurn = 'left' | 'right' | 'straight' | 'uturn' | 'arrive';

export type ManeuverCue = {
  meters: number;
  title: string;
  turn: ManeuverTurn;
};

const words = {
  uk: {
    arrived: 'Ви на місці',
    roundabout: 'Кільце',
    uturn: 'Розворот',
    fork: 'Розвилка',
    straight: 'Прямо',
    turn: 'Поворот',
    left: 'ліворуч',
    right: 'праворуч',
  },
  ru: {
    arrived: 'Вы на месте',
    roundabout: 'Кольцо',
    uturn: 'Разворот',
    fork: 'Развилка',
    straight: 'Прямо',
    turn: 'Поворот',
    left: 'налево',
    right: 'направо',
  },
};

export function nextCue(
  route: RoutePlan,
  latitude: number,
  longitude: number,
  language: ResolvedLanguage = 'uk',
): ManeuverCue {
  const text = words[language];
  const progress = progressAlong(route.coordinates, latitude, longitude);
  const remaining = Math.max(0, route.distanceM - progress);
  const ahead = route.steps.find(step => step.kind !== 'depart' && (step.alongM ?? 0) > progress + 12);
  if (remaining < 28) {
    return {meters: remaining, title: text.arrived, turn: 'arrive'};
  }
  if (!ahead) {
    return {meters: remaining, title: text.straight, turn: 'straight'};
  }
  const meters = Math.max(0, (ahead.alongM ?? remaining) - progress);
  return {meters, title: cueTitle(ahead, text), turn: cueTurn(ahead)};
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

function cueTitle(step: RouteStep, text: (typeof words)['uk']): string {
  const kind = step.kind ?? '';
  const modifier = step.modifier ?? '';
  if (kind === 'arrive') {
    return text.arrived;
  }
  if (kind === 'roundabout' || kind === 'rotary' || kind === 'exit roundabout') {
    return text.roundabout;
  }
  if (kind === 'uturn' || modifier === 'uturn') {
    return text.uturn;
  }
  const side = sideWord(modifier, text);
  if (kind === 'fork' || kind === 'end of road') {
    return side ? `${text.fork} ${side}` : text.fork;
  }
  if (modifier === 'straight' || kind === 'continue' || kind === 'new name') {
    return step.name ? `${text.straight} · ${step.name}` : text.straight;
  }
  if (side) {
    return `${text.turn} ${side}`;
  }
  return step.name || text.straight;
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
