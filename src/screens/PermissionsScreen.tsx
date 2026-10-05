import {useEffect, useState} from 'react';
import {AppState, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {PremiumSwitch} from '../components/PremiumSwitch';
import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {PrimaryButton} from '../components/PrimaryButton';
import NativeLocationManager from '../native/NativeLocationManager';
import NativeMotionManager from '../native/NativeMotionManager';
import NativeOBDManager from '../native/NativeOBDManager';
import type {RootStackParamList} from '../navigation/types';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

type SensorId = 'location' | 'background' | 'bluetooth' | 'motion';

function sensorCopy(copy: ReturnType<typeof uiCopy>): Array<{id: SensorId; title: string; body: string; mark: string}> {
  return [
    {id: 'location', title: copy.sensorLocation, body: copy.sensorLocationBody, mark: '◎'},
    {id: 'background', title: copy.sensorBackground, body: copy.sensorBackgroundBody, mark: '◌'},
    {id: 'bluetooth', title: copy.sensorObd, body: copy.sensorObdBody, mark: '⌁'},
    {id: 'motion', title: copy.sensorMotion, body: copy.sensorMotionBody, mark: '↻'},
  ];
}

const granted = new Set(['authorizedAlways', 'authorizedWhenInUse']);
let backgroundDismissed = false;
let sawAlways = false;
const sensorOn: Record<SensorId, boolean> = {
  location: false,
  background: false,
  bluetooth: false,
  motion: false,
};
const sensorListeners = new Set<() => void>();

function publishSensor(id: SensorId, value: boolean) {
  sensorOn[id] = value;
  sensorListeners.forEach(listener => listener());
}

function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

async function locationStatus(): Promise<string> {
  return (await NativeLocationManager?.getAuthorizationStatus()) ?? 'notDetermined';
}

async function waitForLocation(accept: (status: string) => boolean): Promise<string> {
  const started = Date.now();
  let leftApp = AppState.currentState !== 'active';
  const sub = AppState.addEventListener('change', state => {
    if (state !== 'active') {
      leftApp = true;
    }
  });
  try {
    while (Date.now() - started < 25000) {
      const status = await locationStatus();
      const terminal = status === 'denied' || status === 'restricted' || accept(status);
      const dialogClosed = leftApp && AppState.currentState === 'active' && status !== 'notDetermined';
      if (terminal || dialogClosed) {
        return status;
      }
      await wait(200);
    }
    return locationStatus();
  } finally {
    sub.remove();
  }
}

function applyLocationStatus(status: string) {
  if (status === 'authorizedAlways') {
    sawAlways = true;
  }
  if (status === 'authorizedAlways' || status === 'authorizedWhenInUse') {
    publishSensor('location', true);
  } else if (status === 'denied' || status === 'restricted') {
    publishSensor('location', false);
    publishSensor('background', false);
    return;
  }
  if (status === 'authorizedAlways' && !backgroundDismissed) {
    publishSensor('background', true);
    NativeLocationManager?.setBackgroundUpdates(true);
  }
}

async function waitForAlways(): Promise<string> {
  const started = Date.now();
  let leftAfterPrompt = false;
  let backAt = 0;
  let reported = '';
  const appSub = AppState.addEventListener('change', state => {
    if (Date.now() - started < 900) {
      return;
    }
    if (state === 'active') {
      if (leftAfterPrompt) {
        backAt = Date.now();
      }
    } else {
      leftAfterPrompt = true;
      backAt = 0;
    }
  });
  const authSub = NativeLocationManager?.onAuthorization(event => {
    if (event?.status) {
      reported = event.status;
      applyLocationStatus(event.status);
    }
  });
  const finish = async (fallback: string) => {
    if (sawAlways || reported === 'authorizedAlways') {
      return 'authorizedAlways';
    }
    const fresh = await locationStatus();
    if (fresh === 'authorizedAlways' || reported === 'authorizedAlways') {
      return 'authorizedAlways';
    }
    return fresh || reported || fallback;
  };
  try {
    while (Date.now() - started < 45000) {
      if (sawAlways || reported === 'authorizedAlways') {
        return 'authorizedAlways';
      }
      const status = await locationStatus();
      if (status === 'authorizedAlways') {
        return 'authorizedAlways';
      }
      if (status === 'denied' || status === 'restricted' || reported === 'denied' || reported === 'restricted') {
        return status === 'denied' || status === 'restricted' ? status : reported;
      }
      const promptClosed = leftAfterPrompt && backAt > 0 && Date.now() - backAt >= 4000;
      if (promptClosed) {
        return finish(status);
      }
      await wait(250);
    }
    return finish(await locationStatus());
  } finally {
    appSub.remove();
    authSub?.remove();
  }
}

export function PermissionsScreen({navigation}: Props) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  const sensors = sensorCopy(copy);
  const [enabled, setEnabled] = useState<Record<SensorId, boolean>>({...sensorOn});
  const [busy, setBusy] = useState<SensorId | null>(null);

  useEffect(() => {
    const listener = () => setEnabled({...sensorOn});
    sensorListeners.add(listener);
    let alive = true;
    const pull = () => {
      locationStatus()
        .then(status => {
          if (alive) {
            applyLocationStatus(status);
          }
        })
        .catch(() => undefined);
    };
    pull();
    const auth = NativeLocationManager?.onAuthorization(event => {
      if (event?.status) {
        applyLocationStatus(event.status);
      }
    });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') {
        pull();
        [400, 1200, 2500].forEach(delay => {
          setTimeout(pull, delay);
        });
      }
    });
    return () => {
      alive = false;
      sensorListeners.delete(listener);
      auth?.remove();
      app.remove();
    };
  }, []);

  const setOne = (id: SensorId, value: boolean) => {
    publishSensor(id, value);
  };

  const turnOff = (id: SensorId) => {
    if (id === 'location' || id === 'background') {
      backgroundDismissed = true;
      if (id === 'background') {
        NativeLocationManager?.setBackgroundUpdates(false);
      } else {
        NativeLocationManager?.stopUpdates();
        NativeLocationManager?.setBackgroundUpdates(false);
        setOne('background', false);
      }
    } else if (id === 'bluetooth') {
      NativeOBDManager?.stopScan();
    } else {
      NativeMotionManager?.stop();
    }
    setOne(id, false);
  };

  const turnOn = async (id: SensorId) => {
    setOne(id, true);
    if (id === 'location') {
      const pending = NativeLocationManager?.requestWhenInUse();
      const status = await waitForLocation(value => granted.has(value));
      pending?.catch(() => undefined);
      if (!granted.has(status)) {
        setOne('location', false);
        return;
      }
      NativeLocationManager?.startUpdates(false);
      setOne('location', true);
      return;
    }
    if (id === 'background') {
      backgroundDismissed = false;
      sawAlways = false;
      const current = await locationStatus();
      if (!granted.has(current)) {
        const pending = NativeLocationManager?.requestWhenInUse();
        const whenInUse = await waitForLocation(value => granted.has(value));
        pending?.catch(() => undefined);
        if (!granted.has(whenInUse)) {
          setOne('background', false);
          return;
        }
        setOne('location', true);
      }
      const pendingAlways = NativeLocationManager?.requestAlways();
      const status = await waitForAlways();
      pendingAlways?.catch(() => undefined);
      if (status === 'authorizedAlways' || sawAlways) {
        applyLocationStatus('authorizedAlways');
        return;
      }
      if (!sawAlways && !backgroundDismissed) {
        setOne('background', false);
      }
      return;
    }
    if (id === 'bluetooth') {
      NativeOBDManager?.startScan();
      setOne('bluetooth', true);
      return;
    }
    const started = await NativeMotionManager?.start();
    setOne('motion', started === true);
  };

  const toggle = (id: SensorId, next: boolean) => {
    if (busy) {
      return;
    }
    if (!next) {
      turnOff(id);
      return;
    }
    setBusy(id);
    turnOn(id)
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never">
        <Text style={[type.display, {color: colors.textPrimary}]}>{copy.sensors}</Text>
        <Text style={[type.body, {color: colors.textSecondary}]}>{copy.sensorsLead}</Text>
        {sensors.map((sensor, index) => (
          <Animated.View key={sensor.id} entering={FadeInDown.delay(80 * index).duration(420)}>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <View style={[styles.mark, {backgroundColor: colors.accentSoft}]}>
                <Text style={[styles.markText, {color: colors.accent}]}>{sensor.mark}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{sensor.title}</Text>
                <Text style={[type.caption, {color: colors.textSecondary}]}>{sensor.body}</Text>
              </View>
              <PremiumSwitch
                value={enabled[sensor.id]}
                disabled={busy != null && busy !== sensor.id}
                onChange={next => toggle(sensor.id, next)}
              />
            </View>
          </Animated.View>
        ))}
        <Text style={[type.caption, {color: colors.textMuted}]}>
          {copy.sensorsFoot}
        </Text>
      </ScrollView>
      <PrimaryButton title={copy.continue} onPress={() => navigation.reset({index: 0, routes: [{name: 'Main'}]})} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, paddingHorizontal: 20, paddingBottom: 12, gap: 12},
  content: {gap: 12, paddingTop: 8, paddingBottom: 20},
  card: {
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#1C1430',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  mark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {fontSize: 18, fontWeight: '700'},
  copy: {flex: 1, gap: 4},
});
