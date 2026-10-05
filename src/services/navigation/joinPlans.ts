import type {Place, RoutePlan} from '../../models/domain';
import {planRoutes} from '../roads/Router';
import type {RoadGraph} from '../roads/RoadGraph';

export function joinPlans(parts: RoutePlan[]): RoutePlan | null {
  const first = parts[0];
  if (!first) {
    return null;
  }
  if (parts.length === 1) {
    return first;
  }
  const coordinates = [...first.coordinates];
  const steps = [...first.steps];
  let distanceM = first.distanceM;
  let durationS = first.durationS;
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    coordinates.push(...part.coordinates.slice(1));
    part.steps.forEach(step => {
      steps.push({...step, alongM: (step.alongM ?? 0) + distanceM});
    });
    distanceM += part.distanceM;
    durationS += part.durationS;
  }
  return {...first, distanceM, durationS, steps, coordinates};
}

export function planThroughStops(
  graph: RoadGraph,
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  stops: Place[],
): RoutePlan[] {
  if (stops.length === 0) {
    return planRoutes(graph, originLat, originLon, destinationLat, destinationLon);
  }
  const points = [
    {latitude: originLat, longitude: originLon},
    ...stops,
    {latitude: destinationLat, longitude: destinationLon},
  ];
  const parts: RoutePlan[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const piece = planRoutes(graph, from.latitude, from.longitude, to.latitude, to.longitude, 1)[0];
    if (!piece) {
      return [];
    }
    parts.push(piece);
  }
  const joined = joinPlans(parts);
  return joined ? [{...joined, via: 'graph'}] : [];
}
