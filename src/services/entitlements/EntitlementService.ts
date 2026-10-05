import NativeTripSession from '../../native/NativeTripSession';
import {useSettingsStore} from '../../store/settingsStore';

export function syncDrAllowance(): void {
  NativeTripSession?.setDeadReckoningAllowed(useSettingsStore.getState().autoDr);
  NativeTripSession?.setIgnoreGps(useSettingsStore.getState().gpsCheck);
}
