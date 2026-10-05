import {create} from 'zustand';

export type CalibrationRecord = {
  carId: string;
  adapterId: string;
  at: number;
};

export type SettingsState = {
  hydrated: boolean;
  onboarded: boolean;
  unit: 'kmh' | 'mph';
  theme: 'light' | 'dark' | 'system';
  language: 'system' | 'uk' | 'ru';
  carId: string;
  autoDr: boolean;
  gpsWarnings: boolean;
  gpsCheck: boolean;
  wifiHost: string;
  wifiPort: number;
  autoReturnSeconds: number;
  keepManualZoom: boolean;
  baseZoom: number;
  placeIcons: boolean;
  speedCameras: boolean;
  autoLockParked: boolean;
  autoUnlockGps: boolean;
  mapCoach: boolean;
  coachSeen: boolean;
  voice: boolean;
  calibration: CalibrationRecord | null;
  setHydrated: (value: boolean) => void;
  setOnboarded: (value: boolean) => void;
  setUnit: (unit: 'kmh' | 'mph') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: 'system' | 'uk' | 'ru') => void;
  setCarId: (carId: string) => void;
  setAutoDr: (value: boolean) => void;
  setGpsWarnings: (value: boolean) => void;
  setGpsCheck: (value: boolean) => void;
  setWifi: (host: string, port: number) => void;
  setAutoReturnSeconds: (value: number) => void;
  setKeepManualZoom: (value: boolean) => void;
  setBaseZoom: (value: number) => void;
  setPlaceIcons: (value: boolean) => void;
  setSpeedCameras: (value: boolean) => void;
  setAutoLockParked: (value: boolean) => void;
  setAutoUnlockGps: (value: boolean) => void;
  setMapCoach: (value: boolean) => void;
  setCoachSeen: (value: boolean) => void;
  setVoice: (value: boolean) => void;
  setCalibration: (value: CalibrationRecord) => void;
  clearCalibration: () => void;
  hydrate: (value: Partial<SettingsState>) => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  hydrated: false,
  onboarded: false,
  unit: 'kmh',
  theme: 'light',
  language: 'uk',
  carId: 'none',
  autoDr: true,
  gpsWarnings: true,
  gpsCheck: false,
  wifiHost: '192.168.0.10',
  wifiPort: 35000,
  autoReturnSeconds: 5,
  keepManualZoom: false,
  baseZoom: 16,
  placeIcons: true,
  speedCameras: false,
  autoLockParked: true,
  autoUnlockGps: true,
  mapCoach: false,
  coachSeen: false,
  voice: true,
  calibration: null,
  setHydrated: hydrated => set({hydrated}),
  setOnboarded: onboarded => set({onboarded}),
  setUnit: unit => set({unit}),
  setTheme: theme => set({theme}),
  setLanguage: language => set({language}),
  setCarId: carId => set({carId}),
  setAutoDr: autoDr => set({autoDr}),
  setGpsWarnings: gpsWarnings => set({gpsWarnings}),
  setGpsCheck: gpsCheck => set({gpsCheck}),
  setWifi: (wifiHost, wifiPort) => set({wifiHost, wifiPort}),
  setAutoReturnSeconds: autoReturnSeconds => set({autoReturnSeconds}),
  setKeepManualZoom: keepManualZoom => set({keepManualZoom}),
  setBaseZoom: baseZoom => set({baseZoom}),
  setPlaceIcons: placeIcons => set({placeIcons}),
  setSpeedCameras: speedCameras => set({speedCameras}),
  setAutoLockParked: autoLockParked => set({autoLockParked}),
  setAutoUnlockGps: autoUnlockGps => set({autoUnlockGps}),
  setMapCoach: mapCoach => set({mapCoach}),
  setCoachSeen: coachSeen => set({coachSeen}),
  setVoice: voice => set({voice}),
  setCalibration: calibration =>
    set(state => {
      const current = state.calibration;
      if (
        current &&
        current.carId === calibration.carId &&
        current.adapterId === calibration.adapterId
      ) {
        return state;
      }
      return {calibration};
    }),
  clearCalibration: () => set({calibration: null}),
  hydrate: value => set(value),
}));
