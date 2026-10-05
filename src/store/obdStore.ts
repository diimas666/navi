import {create} from 'zustand';

import type {NativeOBDDevice, NativeOBDSnapshot} from '../native/NativeOBDManager';

type ObdState = {
  transport: 'ble' | 'wifi';
  state: string;
  message: string;
  devices: NativeOBDDevice[];
  snapshot: NativeOBDSnapshot | null;
  setTransport: (transport: 'ble' | 'wifi') => void;
  setState: (state: string, message: string) => void;
  upsertDevice: (device: NativeOBDDevice) => void;
  setDevices: (devices: NativeOBDDevice[]) => void;
  setSnapshot: (snapshot: NativeOBDSnapshot) => void;
};

export const useObdStore = create<ObdState>(set => ({
  transport: 'ble',
  state: 'idle',
  message: '',
  devices: [],
  snapshot: null,
  setTransport: transport => set({transport}),
  setState: (state, message) => set({state, message}),
  upsertDevice: device =>
    set(current => ({
      devices: [device, ...current.devices.filter(item => item.id !== device.id)],
    })),
  setDevices: devices => set({devices}),
  setSnapshot: snapshot => set({snapshot}),
}));
