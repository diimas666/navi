import AsyncStorage from '@react-native-async-storage/async-storage';

import {useSettingsStore, type SettingsState} from '../../store/settingsStore';

const KEY = 'neiv.settings.v1';

export type PersistedSettings = Pick<
  SettingsState,
  | 'onboarded'
  | 'unit'
  | 'theme'
  | 'language'
  | 'carId'
  | 'autoDr'
  | 'gpsWarnings'
  | 'gpsCheck'
  | 'wifiHost'
  | 'wifiPort'
  | 'autoReturnSeconds'
  | 'keepManualZoom'
  | 'baseZoom'
  | 'placeIcons'
  | 'speedCameras'
  | 'autoLockParked'
  | 'autoUnlockGps'
  | 'mapCoach'
  | 'coachSeen'
  | 'voice'
  | 'routePref'
  | 'calibration'
>;

export async function loadSettings(): Promise<Partial<PersistedSettings>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  const record = parsed as Partial<PersistedSettings> & {
    sessionMode?: unknown;
    diagnostics?: unknown;
    diagnosticsNetwork?: unknown;
  };
  delete record.sessionMode;
  delete record.diagnostics;
  delete record.diagnosticsNetwork;
  if (record.coachSeen == null) {
    record.coachSeen = record.mapCoach === false;
  }
  if (record.coachSeen) {
    record.mapCoach = false;
  }
  record.unit = 'kmh';
  delete (record as {satelliteMap?: unknown}).satelliteMap;
  if (record.routePref !== 'faster' && record.routePref !== 'shorter' && record.routePref !== 'noHighway') {
    record.routePref = 'shorter';
  }
  return record;
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

export function selectPersisted(state: SettingsState): PersistedSettings {
  return {
    onboarded: state.onboarded,
    unit: state.unit,
    theme: state.theme,
    language: state.language,
    carId: state.carId,
    autoDr: state.autoDr,
    gpsWarnings: state.gpsWarnings,
    gpsCheck: state.gpsCheck,
    wifiHost: state.wifiHost,
    wifiPort: state.wifiPort,
    autoReturnSeconds: state.autoReturnSeconds,
    keepManualZoom: state.keepManualZoom,
    baseZoom: state.baseZoom,
    placeIcons: state.placeIcons,
    speedCameras: state.speedCameras,
    autoLockParked: state.autoLockParked,
    autoUnlockGps: state.autoUnlockGps,
    mapCoach: state.mapCoach,
    coachSeen: state.coachSeen,
    voice: state.voice,
    routePref: state.routePref,
    calibration: state.calibration,
  };
}

export function useSettingsStoreSnapshot(): PersistedSettings {
  return selectPersisted(useSettingsStore.getState());
}
