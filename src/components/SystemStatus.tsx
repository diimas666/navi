import {useState, type ReactNode} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import type {NativeSnapshot} from '../native/NativeTripSession';
import {useSettingsStore} from '../store/settingsStore';
import {formatDuration} from '../utils/format';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';

type GpsCopy = {title: string; body: string};

export function gpsStatusCopy(snapshot: NativeSnapshot | null, gpsCheck: boolean): GpsCopy {
  const copy = uiCopy(useSettingsStore.getState().language);
  if (gpsCheck) {
    return {title: copy.gpsCheck, body: copy.gpsCheckBody};
  }
  if (!snapshot || !snapshot.hasGps) {
    if (snapshot?.source === 'dr' || snapshot?.source === 'blended') {
      const moving = snapshot.hasSpeed && (snapshot.speedSource === 'obd' || snapshot.speedSource === 'inertial');
      const bySensors = snapshot.speedSource === 'inertial' ? copy.byAccel : copy.byObd;
      return {
        title: snapshot.trust === 'untrusted' ? copy.gpsRejected : copy.gpsLost,
        body: moving ? bySensors : copy.bySensors,
      };
    }
    if (snapshot?.source === 'held') {
      return {title: copy.gpsRejected, body: copy.held};
    }
    return {title: copy.gpsSearch, body: ''};
  }
  const error = Math.max(1, Math.round(snapshot.gpsAccuracy));
  const signal = `${copy.gpsSignal} (${copy.gpsError} ${error} м).`;
  if (snapshot.trust === 'trusted') {
    return {title: copy.gpsTrusted, body: signal};
  }
  if (snapshot.trust === 'degraded') {
    let follow = '';
    if (snapshot.speedSource === 'obd') {
      follow = copy.byCar;
    } else if (snapshot.source === 'dr' || snapshot.source === 'blended') {
      follow = copy.estimated;
    }
    return {title: copy.gpsSearch, body: `${signal} ${copy.checking}${follow}`};
  }
  if (snapshot.trust === 'untrusted') {
    return {title: copy.gpsUntrusted, body: `${signal} ${copy.notTruth}`};
  }
  return {title: copy.gpsSearch, body: ''};
}

type Phase = 'on' | 'wait' | 'off';

const sheetCopy = {
  uk: {
    open: 'Стан системи',
    title: 'Стан системи',
    close: 'Закрити',
    network: 'Мережа',
    networkOn: 'Є зв’язок',
    networkOnBody: 'Карта і пошук адрес ідуть через інтернет.',
    networkWait: 'Перевіряємо зв’язок',
    networkWaitBody: 'Ще не відомо, чи є мережа.',
    networkOff: 'Немає мережі',
    networkOffBody: 'Маршрут лишається на вже збережених картах.',
    adapter: 'Адаптер',
    adapterOn: 'Підключено',
    adapterOnBody: 'Швидкість береться з автомобіля.',
    adapterWait: 'Встановлюємо зв’язок',
    adapterWaitBody: 'Шукаємо адаптер або підключаємось до нього.',
    adapterOff: 'Не підключено',
    adapterOffBody: 'Навігація працює від телефона. Ведення при глушінні — лише з адаптером.',
    setup: 'Налаштувати адаптер',
    gps: 'GPS',
  },
  ru: {
    open: 'Состояние системы',
    title: 'Состояние системы',
    close: 'Закрыть',
    network: 'Сеть',
    networkOn: 'Связь есть',
    networkOnBody: 'Карта и поиск адресов идут через интернет.',
    networkWait: 'Проверяем связь',
    networkWaitBody: 'Ещё не известно, есть ли сеть.',
    networkOff: 'Нет сети',
    networkOffBody: 'Маршрут остаётся на уже сохранённых картах.',
    adapter: 'Адаптер',
    adapterOn: 'Подключён',
    adapterOnBody: 'Скорость берётся с автомобиля.',
    adapterWait: 'Устанавливаем связь',
    adapterWaitBody: 'Ищем адаптер или подключаемся к нему.',
    adapterOff: 'Не подключён',
    adapterOffBody: 'Навигация работает от телефона. Ведение при глушении — только с адаптером.',
    setup: 'Настроить адаптер',
    gps: 'GPS',
  },
};

export function StatusIcons({
  adapterState,
  online,
  linkKnown,
  snapshot,
  gpsCheck,
  onSetup,
}: {
  adapterState: string;
  online: boolean;
  linkKnown: boolean;
  snapshot: NativeSnapshot | null;
  gpsCheck: boolean;
  onSetup: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const text = sheetCopy[language];
  const network = networkPhase(online, linkKnown);
  const adapter = adapterPhase(adapterState);
  const gps = gpsPhase(snapshot, gpsCheck);
  const gpsRow = gpsStatusCopy(snapshot, gpsCheck);
  const attention = network === 'off' || gps === 'off';
  const pending = !attention && (network === 'wait' || gps === 'wait');
  const close = () => setOpen(false);

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text.open}
        onPress={() => setOpen(true)}
        style={styles.circle}>
        <StatusMark />
        {attention || pending ? (
          <View style={[styles.badge, {backgroundColor: attention ? '#C4473A' : '#C48A12'}]} />
        ) : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modal}>
          <Pressable accessibilityRole="button" accessibilityLabel={text.close} onPress={close} style={styles.scrim} />
          <View style={[styles.sheet, {backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16)}]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, {color: colors.textPrimary}]}>{text.title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text.close}
                onPress={close}
                hitSlop={8}
                style={[styles.close, {backgroundColor: colors.surfaceMuted}]}>
                <CloseMark color={colors.textPrimary} />
              </Pressable>
            </View>
            <StatusCard
              kicker={text.network}
              title={network === 'on' ? text.networkOn : network === 'wait' ? text.networkWait : text.networkOff}
              body={network === 'on' ? text.networkOnBody : network === 'wait' ? text.networkWaitBody : text.networkOffBody}
              phase={network}
              icon={<WifiGlyph phase={network} />}
            />
            <StatusCard
              kicker={text.adapter}
              title={adapter === 'on' ? text.adapterOn : adapter === 'wait' ? text.adapterWait : text.adapterOff}
              body={adapter === 'on' ? text.adapterOnBody : adapter === 'wait' ? text.adapterWaitBody : text.adapterOffBody}
              phase={adapter}
              icon={<PlugGlyph phase={adapter} />}
              action={
                adapter === 'on' ? null : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      close();
                      onSetup();
                    }}
                    style={styles.setup}>
                    <Text style={styles.setupLabel}>{text.setup}</Text>
                  </Pressable>
                )
              }
            />
            <StatusCard kicker={text.gps} title={gpsRow.title} body={gpsRow.body} phase={gps} icon={<TargetGlyph phase={gps} />} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function networkPhase(online: boolean, linkKnown: boolean): Phase {
  if (!linkKnown) {
    return 'wait';
  }
  return online ? 'on' : 'off';
}

function adapterPhase(state: string): Phase {
  if (state === 'ready') {
    return 'on';
  }
  if (state === 'scanning' || state === 'connecting') {
    return 'wait';
  }
  return 'off';
}

function gpsPhase(snapshot: NativeSnapshot | null, gpsCheck: boolean): Phase {
  if (gpsCheck) {
    return 'wait';
  }
  if (!snapshot || !snapshot.hasGps) {
    if (snapshot?.source === 'dr' || snapshot?.source === 'blended' || snapshot?.source === 'held') {
      return 'off';
    }
    return 'wait';
  }
  if (snapshot.trust === 'trusted') {
    return 'on';
  }
  if (snapshot.trust === 'degraded') {
    return 'wait';
  }
  return 'off';
}

function StatusCard({
  kicker,
  title,
  body,
  phase,
  icon,
  action,
}: {
  kicker: string;
  title: string;
  body: string;
  phase: Phase;
  icon: ReactNode;
  action?: ReactNode;
}) {
  const {colors} = useTheme();
  const dot = phase === 'on' ? colors.success : phase === 'wait' ? colors.warning : colors.textMuted;
  return (
    <View style={[styles.card, {backgroundColor: colors.surface}]}>
      <View style={styles.cardRow}>
        <View style={[styles.iconPlate, {backgroundColor: colors.surfaceMuted}]}>{icon}</View>
        <View style={styles.cardCopy}>
          <Text style={[styles.kicker, {color: colors.textMuted}]}>{kicker}</Text>
          <View style={styles.titleRow}>
            <View style={[styles.dot, {backgroundColor: dot}]} />
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{title}</Text>
          </View>
          {body ? <Text style={[styles.cardBody, {color: colors.textSecondary}]}>{body}</Text> : null}
        </View>
      </View>
      {action}
    </View>
  );
}

function StatusMark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markLine} />
      <View style={styles.markLine} />
      <View style={[styles.markLine, styles.markShort]} />
    </View>
  );
}

function CloseMark({color}: {color: string}) {
  return (
    <View style={styles.closeGlyph}>
      <View style={[styles.closeBar, styles.closeBarA, {backgroundColor: color}]} />
      <View style={[styles.closeBar, styles.closeBarB, {backgroundColor: color}]} />
    </View>
  );
}

function WifiGlyph({phase}: {phase: Phase}) {
  const color = phaseColor(phase);
  return (
    <View style={styles.glyph}>
      <SignalArc radius={4.5} color={color} />
      <SignalArc radius={8} color={color} />
      <SignalArc radius={11.5} color={color} />
      <View style={[styles.wifiDot, {backgroundColor: color}]} />
      {phase === 'off' ? <View style={[styles.wifiSlash, {backgroundColor: color}]} /> : null}
    </View>
  );
}

function SignalArc({radius, color}: {radius: number; color: string}) {
  return (
    <View style={[styles.signalClip, {width: radius, height: radius}]}>
      <View
        style={[
          styles.signalRing,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            left: -radius,
            bottom: -radius,
            borderColor: color,
          },
        ]}
      />
    </View>
  );
}

function PlugGlyph({phase}: {phase: Phase}) {
  const color = phaseColor(phase);
  return (
    <View style={styles.plug}>
      <View style={styles.plugPins}>
        <View style={[styles.plugPin, {backgroundColor: color}]} />
        <View style={[styles.plugPin, {backgroundColor: color}]} />
      </View>
      <View style={[styles.plugBody, {borderColor: color}]} />
    </View>
  );
}

function TargetGlyph({phase}: {phase: Phase}) {
  const color = phaseColor(phase);
  return (
    <View style={[styles.targetRing, {borderColor: color}]}>
      <View style={[styles.targetDot, {backgroundColor: color}]} />
    </View>
  );
}

function phaseColor(phase: Phase): string {
  if (phase === 'on') {
    return '#2F7D62';
  }
  if (phase === 'wait') {
    return '#A56B12';
  }
  return '#5C656E';
}

export function offRoadEta(crossTrackM: number | null, speedMps: number, hasSpeed: boolean): string | null {
  if (crossTrackM == null || crossTrackM < 80 || !hasSpeed || speedMps < 1) {
    return null;
  }
  return `≥${formatDuration(crossTrackM / speedMps)}`;
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: 54,
    right: 14,
    zIndex: 5,
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1430',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  mark: {width: 16, gap: 3.5},
  markLine: {height: 2, borderRadius: 1, backgroundColor: '#1C1430'},
  markShort: {width: 10},
  modal: {flex: 1, justifyContent: 'flex-end'},
  scrim: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(28,20,48,0.28)'},
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 10,
  },
  sheetHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4},
  sheetTitle: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  close: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  closeGlyph: {width: 12, height: 12, alignItems: 'center', justifyContent: 'center'},
  closeBar: {position: 'absolute', width: 12, height: 2, borderRadius: 1},
  closeBarA: {transform: [{rotate: '45deg'}]},
  closeBarB: {transform: [{rotate: '-45deg'}]},
  card: {borderRadius: radius.lg, padding: 14, gap: 12},
  cardRow: {flexDirection: 'row', gap: 12},
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {flex: 1, gap: 2},
  kicker: {fontSize: 12, lineHeight: 16, fontWeight: '600'},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 7, height: 7, borderRadius: 4},
  cardTitle: {fontSize: 16, lineHeight: 21, fontWeight: '700', flexShrink: 1},
  cardBody: {fontSize: 14, lineHeight: 19, fontWeight: '500'},
  setup: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#149C96',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupLabel: {color: '#149C96', fontSize: 16, fontWeight: '700'},
  glyph: {width: 22, height: 22},
  signalClip: {position: 'absolute', left: 2, bottom: 3, overflow: 'hidden'},
  signalRing: {position: 'absolute', borderWidth: 1.6},
  wifiDot: {
    position: 'absolute',
    left: 1,
    bottom: 2,
    width: 3.2,
    height: 3.2,
    borderRadius: 2,
  },
  wifiSlash: {
    position: 'absolute',
    left: 10,
    top: -1,
    width: 1.7,
    height: 24,
    borderRadius: 1,
    transform: [{rotate: '-42deg'}],
  },
  plug: {width: 18, height: 18, alignItems: 'center'},
  plugPins: {flexDirection: 'row', gap: 5},
  plugPin: {width: 2.5, height: 5, borderRadius: 1},
  plugBody: {width: 16, height: 11, marginTop: -1, borderWidth: 1.8, borderRadius: 3},
  targetRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetDot: {width: 5, height: 5, borderRadius: 2.5},
});
