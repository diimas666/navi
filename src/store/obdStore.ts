import {create} from 'zustand';

import type {NativeOBDDevice, NativeOBDSnapshot} from '../native/NativeOBDManager';

type ObdState = {
  transport: 'ble' | 'wifi';
  state: string;
  message: string;
  devices: NativeOBDDevice[];
  snapshot: NativeOBDSnapshot | null;
  activeId: string | null;
  setTransport: (transport: 'ble' | 'wifi') => void;
  setState: (state: string, message: string) => void;
  setActiveId: (activeId: string | null) => void;
  upsertDevice: (device: NativeOBDDevice) => void;
  setDevices: (devices: NativeOBDDevice[]) => void;
  setSnapshot: (snapshot: NativeOBDSnapshot) => void;
  clearDevices: () => void;
};

export const useObdStore = create<ObdState>(set => ({
  transport: 'ble',
  state: 'idle',
  message: '',
  devices: [],
  snapshot: null,
  activeId: null,
  setTransport: transport => set({transport, devices: []}),
  setState: (state, message) =>
    set(current => ({
      state,
      message,
      snapshot: state === 'disconnected' || state === 'failed' ? null : current.snapshot,
      activeId: state === 'disconnected' || state === 'failed' ? null : current.activeId,
    })),
  setActiveId: activeId => set({activeId}),
  upsertDevice: device =>
    set(current => ({
      devices: [device, ...current.devices.filter(item => item.id !== device.id)],
    })),
  setDevices: devices => set({devices}),
  setSnapshot: snapshot => set({snapshot}),
  clearDevices: () => set({devices: []}),
}));
