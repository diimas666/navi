import {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';

import {OBDDeviceCard} from '../components/OBDDeviceCard';
import {PrimaryButton} from '../components/PrimaryButton';
import NativeOBDManager from '../native/NativeOBDManager';
import {resolveLanguage} from '../i18n/settingsCopy';
import {useObdStore} from '../store/obdStore';
import {useSettingsStore} from '../store/settingsStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

const copy = {
  uk: {
    title: 'Підключення автомобіля',
    body: 'Швидкість для оцінки береться з OBD-II, PID 0D. Якщо адаптер мовчить, Navi лишає поле порожнім і веде за датчиками телефону.',
    ble: 'Bluetooth LE',
    wifi: 'Wi-Fi',
    chosen: 'Обрано',
    search: 'Шукати',
    searching: 'Шукаємо…',
    disconnect: 'Відключити',
    host: 'Адреса адаптера',
    port: 'Порт',
    idle: 'очікування',
    scanning: 'пошук',
    connecting: 'з’єднання',
    ready: 'підключено',
    failed: 'не вдалося',
    speed: 'Швидкість',
    rpm: 'Оберти',
    load: 'Навантаження',
    throttle: 'Дросель',
    voltage: 'Напруга',
    connected: 'підключено',
  },
  ru: {
    title: 'Подключение автомобиля',
    body: 'Скорость для оценки берётся с OBD-II, PID 0D. Если адаптер молчит, Navi оставляет поле пустым и ведёт по датчикам телефона.',
    ble: 'Bluetooth LE',
    wifi: 'Wi-Fi',
    chosen: 'Выбрано',
    search: 'Искать',
    searching: 'Ищем…',
    disconnect: 'Отключить',
    host: 'Адрес адаптера',
    port: 'Порт',
    idle: 'ожидание',
    scanning: 'поиск',
    connecting: 'соединение',
    ready: 'подключено',
    failed: 'не удалось',
    speed: 'Скорость',
    rpm: 'Обороты',
    load: 'Нагрузка',
    throttle: 'Дроссель',
    voltage: 'Напряжение',
    connected: 'подключено',
  },
};

export function OBDScreen() {
  const {colors} = useTheme();
  const language = useSettingsStore(store => store.language);
  const text = copy[resolveLanguage(language)];
  const transport = useObdStore(store => store.transport);
  const connection = useObdStore(store => store.state);
  const devices = useObdStore(store => store.devices);
  const snapshot = useObdStore(store => store.snapshot);
  const activeId = useObdStore(store => store.activeId);
  const note = useObdStore(store => store.message);
  const wifiHost = useSettingsStore(store => store.wifiHost);
  const wifiPort = useSettingsStore(store => store.wifiPort);
  const [host, setHost] = useState(wifiHost);
  const [port, setPort] = useState(String(wifiPort));

  const pickTransport = (next: 'ble' | 'wifi') => {
    useObdStore.getState().setTransport(next);
    NativeOBDManager?.setTransport(next);
  };

  const scan = () => {
    const nextPort = Number(port);
    const endpoint = Number.isFinite(nextPort) && nextPort > 0 ? Math.round(nextPort) : 35000;
    useObdStore.getState().clearDevices();
    NativeOBDManager?.setTransport(transport);
    if (transport === 'wifi') {
      NativeOBDManager?.setWifiEndpoint(host, endpoint);
      useSettingsStore.getState().setWifi(host, endpoint);
    }
    NativeOBDManager?.startScan();
  };

  const status = stateLabel(connection, text);

  return (
    <View style={[styles.screen, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[type.title, styles.title, {color: colors.textPrimary}]}>{text.title}</Text>
        <Text style={[type.body, {color: colors.textSecondary}]}>{text.body}</Text>

        <View style={[styles.segment, {backgroundColor: colors.surfaceMuted}]}>
          <TransportChoice
            title={text.ble}
            selected={transport === 'ble'}
            onPress={() => pickTransport('ble')}
          />
          <TransportChoice
            title={text.wifi}
            selected={transport === 'wifi'}
            onPress={() => pickTransport('wifi')}
          />
        </View>

        <Text style={[type.caption, {color: colors.accent}]}>
          {`${text.chosen} ${transport === 'wifi' ? text.wifi : text.ble} · ${status}`}
        </Text>

        {transport === 'wifi' ? (
          <View style={styles.wifiRow}>
            <TextInput
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={text.host}
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                styles.host,
                {color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border},
              ]}
            />
            <TextInput
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
              placeholder={text.port}
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                styles.port,
                {color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border},
              ]}
            />
          </View>
        ) : null}

        <PrimaryButton title={connection === 'scanning' ? text.searching : text.search} onPress={scan} />

        {connection === 'failed' && note ? (
          <Text style={[type.caption, {color: colors.danger}]}>{note}</Text>
        ) : null}

        {devices
          .filter(device => device.transport === transport)
          .map(device => (
            <OBDDeviceCard
              key={device.id}
              device={device}
              connected={connection === 'ready' && activeId === device.id}
              connectedLabel={text.connected}
              onPress={() => {
                useObdStore.getState().setActiveId(device.id);
                NativeOBDManager?.connect(device.id).catch(() => undefined);
              }}
            />
          ))}

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Reading label={text.speed} value={snapshot?.hasSpeed ? `${Math.round(snapshot.speedKmh)} км/год` : '—'} />
          <Reading label={text.rpm} value={snapshot?.hasRpm ? `${Math.round(snapshot.rpm)}` : '—'} />
          <Reading label={text.load} value={snapshot?.hasEngineLoad ? `${Math.round(snapshot.engineLoad)}%` : '—'} />
          <Reading label={text.throttle} value={snapshot?.hasThrottle ? `${Math.round(snapshot.throttle)}%` : '—'} />
          <Reading label={text.voltage} value={snapshot?.hasVoltage ? `${snapshot.voltage.toFixed(1)} В` : '—'} last />
        </View>

        {connection === 'ready' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              NativeOBDManager?.disconnect().catch(() => undefined);
            }}
            style={[styles.disconnect, {backgroundColor: colors.surfaceMuted}]}>
            <Text style={[type.button, {color: colors.danger}]}>{text.disconnect}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function stateLabel(
  state: string,
  text: {idle: string; scanning: string; connecting: string; ready: string; failed: string},
): string {
  if (state === 'scanning') {
    return text.scanning;
  }
  if (state === 'connecting' || state === 'initializing') {
    return text.connecting;
  }
  if (state === 'ready') {
    return text.ready;
  }
  if (state === 'failed') {
    return text.failed;
  }
  return text.idle;
}

function TransportChoice({title, selected, onPress}: {title: string; selected: boolean; onPress: () => void}) {
  const {colors} = useTheme();
  const plate = selected ? colors.surface : 'transparent';
  const line = selected ? colors.accent : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? {selected: true} : {}}
      onPress={onPress}
      style={[styles.choice, {backgroundColor: plate, borderColor: line}]}>
      <Text style={[type.bodyStrong, {color: selected ? colors.accent : colors.textSecondary}]}>{title}</Text>
    </Pressable>
  );
}

function Reading({label, value, last}: {label: string; value: string; last?: boolean}) {
  const {colors} = useTheme();
  return (
    <View style={[styles.reading, last ? null : styles.readingLine, {borderBottomColor: colors.border}]}>
      <Text style={[type.body, {color: colors.textSecondary}]}>{label}</Text>
      <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 14},
  title: {fontSize: 28, lineHeight: 34},
  segment: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  choice: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wifiRow: {flexDirection: 'row', gap: 8},
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 52,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  host: {flex: 1},
  port: {width: 96},
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  reading: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  readingLine: {borderBottomWidth: StyleSheet.hairlineWidth},
  disconnect: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
