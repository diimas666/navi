import {create} from 'zustand';

import {uiCopy} from '../i18n/uiCopy';
import type {RoutePlan, TrustLevel} from '../models/domain';
import {useSettingsStore} from './settingsStore';
import type {NativeSnapshot} from '../native/NativeTripSession';

type SessionState = {
  snapshot: NativeSnapshot | null;
  displayLatitude: number | null;
  displayLongitude: number | null;
  roadName: string | null;
  roadApplied: boolean;
  crossTrackM: number | null;
  route: RoutePlan | null;
  alternatives: RoutePlan[];
  routeMissing: boolean;
  routeNote: string | null;
  destinationName: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  follow: boolean;
  recording: boolean;
  locked: boolean;
  manualLock: boolean;
  lockLatitude: number | null;
  lockLongitude: number | null;
  lockHeading: number;
  setSnapshot: (snapshot: NativeSnapshot) => void;
  setDisplay: (latitude: number, longitude: number, roadName: string | null, applied: boolean, crossTrackM: number | null) => void;
  setRoute: (
    route: RoutePlan | null,
    destinationName: string | null,
    at?: {latitude: number; longitude: number},
  ) => void;
  setAlternatives: (routes: RoutePlan[]) => void;
  markRouteMissing: (note?: string) => void;
  setFollow: (follow: boolean) => void;
  setRecording: (recording: boolean) => void;
  lockPosition: (latitude: number, longitude: number, heading: number, manual?: boolean) => void;
  unlockPosition: () => void;
  resetRoute: () => void;
};

export const useSessionStore = create<SessionState>(set => ({
  snapshot: null,
  displayLatitude: null,
  displayLongitude: null,
  roadName: null,
  roadApplied: false,
  crossTrackM: null,
  route: null,
  alternatives: [],
  routeMissing: false,
  routeNote: null,
  destinationName: null,
  destinationLatitude: null,
  destinationLongitude: null,
  follow: true,
  recording: false,
  locked: false,
  manualLock: false,
  lockLatitude: null,
  lockLongitude: null,
  lockHeading: 0,
  setSnapshot: snapshot => set({snapshot}),
  setDisplay: (displayLatitude, displayLongitude, roadName, roadApplied, crossTrackM) =>
    set({displayLatitude, displayLongitude, roadName, roadApplied, crossTrackM}),
  setRoute: (route, destinationName, at) =>
    set({
      route,
      destinationName,
      routeMissing: false,
      routeNote: null,
      destinationLatitude: at?.latitude ?? null,
      destinationLongitude: at?.longitude ?? null,
    }),
  setAlternatives: alternatives => set({alternatives}),
  markRouteMissing: note =>
    set({
      route: null,
      alternatives: [],
      destinationName: null,
      destinationLatitude: null,
      destinationLongitude: null,
      routeMissing: true,
      routeNote: note ?? uiCopy(useSettingsStore.getState().language).routeMissing,
    }),
  setFollow: follow => set({follow}),
  setRecording: recording => set({recording}),
  lockPosition: (lockLatitude, lockLongitude, lockHeading, manual = false) =>
    set({locked: true, manualLock: manual, lockLatitude, lockLongitude, lockHeading}),
  unlockPosition: () => set({locked: false, manualLock: false}),
  resetRoute: () =>
    set({
      route: null,
      alternatives: [],
      destinationName: null,
      destinationLatitude: null,
      destinationLongitude: null,
      routeMissing: false,
      routeNote: null,
    }),
}));

export function trustLabel(trust: TrustLevel): string {
  const copy = uiCopy(useSettingsStore.getState().language);
  switch (trust) {
    case 'trusted':
      return copy.trustTrusted;
    case 'degraded':
      return copy.trustDegraded;
    case 'untrusted':
      return copy.trustUntrusted;
    case 'lost':
      return copy.trustLost;
  }
}
