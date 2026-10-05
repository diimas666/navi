import {create} from 'zustand';

import type {Place} from '../models/domain';

type LinkState = {
  pending: Place | null;
  token: number;
  offer: (place: Place) => void;
  clear: () => void;
};

export const useLinkStore = create<LinkState>(set => ({
  pending: null,
  token: 0,
  offer: pending => set(state => ({pending, token: state.token + 1})),
  clear: () => set({pending: null}),
}));
