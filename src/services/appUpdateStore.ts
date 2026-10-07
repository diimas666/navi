import AsyncStorage from '@react-native-async-storage/async-storage';

import {readUpdateSnooze, UPDATE_SNOOZE_MS, type UpdateSnooze} from './appUpdate';

const SNOOZE_KEY = 'neiv.update-snooze.v1';

export async function loadUpdateSnooze(): Promise<UpdateSnooze | null> {
  const raw = await AsyncStorage.getItem(SNOOZE_KEY);
  return readUpdateSnooze(raw);
}

export async function snoozeUpdate(version: string, now = Date.now()): Promise<void> {
  const payload: UpdateSnooze = {version, until: now + UPDATE_SNOOZE_MS};
  await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(payload));
}
