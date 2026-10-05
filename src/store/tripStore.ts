import {create} from 'zustand';

import type {TripRecord} from '../models/domain';

type TripState = {
  trips: TripRecord[];
  setTrips: (trips: TripRecord[]) => void;
  addTrip: (trip: TripRecord) => void;
};

export const useTripStore = create<TripState>(set => ({
  trips: [],
  setTrips: trips => set({trips}),
  addTrip: trip => set(state => ({trips: [trip, ...state.trips]})),
}));
