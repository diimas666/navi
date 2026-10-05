import {useEffect, useState} from 'react';

import type {RoutePlan} from '../models/domain';
import {bearingDegrees, haversineMeters} from '../utils/geo';

export type DrivePose = {
  latitude: number;
  longitude: number;
  heading: number;
};

const SPEED_MPS = 16;

type Segment = {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  lengthM: number;
  heading: number;
};

export function useRouteDrive(route: RoutePlan | null): DrivePose | null {
  const [pose, setPose] = useState<DrivePose | null>(null);

  useEffect(() => {
    if (!route || route.coordinates.length < 2) {
      setPose(null);
      return;
    }
    const segments = segmentsOf(route.coordinates);
    const total = segments.reduce((sum, segment) => sum + segment.lengthM, 0);
    if (total < 1) {
      setPose(null);
      return;
    }
    let traveled = 0;
    const step = () => {
      traveled = Math.min(total, traveled + SPEED_MPS * 0.1);
      setPose(poseAt(segments, traveled));
    };
    step();
    const timer = setInterval(step, 100);
    return () => clearInterval(timer);
  }, [route]);

  return pose;
}

function segmentsOf(coordinates: Array<[number, number]>): Segment[] {
  const segments: Segment[] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const [fromLon, fromLat] = coordinates[index - 1];
    const [toLon, toLat] = coordinates[index];
    const lengthM = haversineMeters(fromLat, fromLon, toLat, toLon);
    if (lengthM < 0.5) {
      continue;
    }
    segments.push({
      fromLat,
      fromLon,
      toLat,
      toLon,
      lengthM,
      heading: bearingDegrees(fromLat, fromLon, toLat, toLon),
    });
  }
  return segments;
}

function poseAt(segments: Segment[], traveled: number): DrivePose {
  let remain = traveled;
  const last = segments[segments.length - 1];
  for (const segment of segments) {
    if (remain > segment.lengthM) {
      remain -= segment.lengthM;
      continue;
    }
    const ratio = segment.lengthM === 0 ? 0 : remain / segment.lengthM;
    return {
      latitude: segment.fromLat + (segment.toLat - segment.fromLat) * ratio,
      longitude: segment.fromLon + (segment.toLon - segment.fromLon) * ratio,
      heading: segment.heading,
    };
  }
  return {latitude: last.toLat, longitude: last.toLon, heading: last.heading};
}
