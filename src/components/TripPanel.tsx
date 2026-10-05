import {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {uiCopy} from '../i18n/uiCopy';
import type {RoutePlan} from '../models/domain';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {formatTravel} from '../utils/format';

const GO_FILL_MS = 8500;

type PreviewProps = {
  mode: 'preview';
  meters: number;
  seconds: number;
  place: string;
  roads: string;
  best: boolean;
  onGo: () => void;
  onCancel: () => void;
};

type DriveProps = {
  mode: 'drive';
  meters: number;
  seconds: number;
  others: RoutePlan[];
  onPick: (route: RoutePlan) => void;
  onEnd: () => void;
};

type Props = PreviewProps | DriveProps;

export function TripPanel(props: Props) {
  const copy = uiCopy(useSettingsStore(state => state.language));
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const barBottom = Math.max(insets.bottom, 12);
  const km = props.meters < 1000 ? `${Math.round(props.meters)} м` : `${(props.meters / 1000).toFixed(1).replace('.', ',')} км`;
  const travel = formatTravel(props.seconds, copy.hours, copy.minutes);
  const arrival = clockAfter(props.seconds);
  const [menu, setMenu] = useState(false);
  const fill = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const armed = useRef(false);
  const onGoRef = useRef<() => void>(() => undefined);
  if (props.mode === 'preview') {
    onGoRef.current = props.onGo;
  }

  useEffect(() => {
    if (props.mode !== 'preview') {
      armed.current = false;
      run.current?.stop();
      return;
    }
    armed.current = true;
    fill.setValue(0);
    scale.setValue(1);
    const anim = Animated.timing(fill, {
      toValue: 1,
      duration: GO_FILL_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.current = anim;
    anim.start(({finished}) => {
      if (!finished || !armed.current) {
        return;
      }
      armed.current = false;
      Animated.sequence([
        Animated.timing(scale, {toValue: 0.94, duration: 90, useNativeDriver: true}),
        Animated.spring(scale, {toValue: 1, friction: 5, useNativeDriver: true}),
      ]).start(() => onGoRef.current());
    });
    return () => {
      armed.current = false;
      anim.stop();
    };
  }, [fill, props.mode, scale]);

  const goNow = () => {
    if (!armed.current) {
      return;
    }
    armed.current = false;
    run.current?.stop();
    onGoRef.current();
  };

  if (props.mode === 'preview') {
    const fillWidth = fill.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });
    const roads = props.roads ? `${copy.via} ${props.roads}` : props.place;
    return (
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Text style={styles.time}>{travel}</Text>
          <Text style={styles.km}>{km}</Text>
        </View>
        <Text numberOfLines={2} style={styles.roads}>
          {roads}
        </Text>
        <Text style={styles.note}>{props.best ? copy.bestRoute : copy.otherRoute}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={props.onCancel} style={styles.postpone}>
            <Text style={styles.postponeLabel}>{copy.postpone}</Text>
          </Pressable>
          <Animated.View style={[styles.goWrap, {transform: [{scale}]}]}>
            <Pressable accessibilityRole="button" onPress={goNow} style={styles.go}>
              <Animated.View style={[styles.goFill, {width: fillWidth}]} />
              <Text style={styles.goLabel}>{copy.go}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMenu(true)}
        style={[styles.eta, {bottom: barBottom + 84, backgroundColor: colors.glass}]}>
        <Text style={[styles.etaTime, {color: colors.textPrimary}]}>{`~${travel}`}</Text>
        <Text style={[styles.etaKm, {color: colors.textSecondary}]}>{km}</Text>
      </Pressable>
      <Modal transparent visible={menu} animationType="slide" onRequestClose={() => setMenu(false)}>
        <View style={styles.menuFill}>
          <Pressable accessibilityRole="button" onPress={() => setMenu(false)} style={[styles.scrim, {backgroundColor: colors.scrim}]} />
          <View style={[styles.menu, {paddingBottom: barBottom + 8, backgroundColor: colors.backgroundRaised}]}>
            <View style={[styles.handle, {backgroundColor: colors.border}]} />
            <Text style={[styles.driveLine, {color: colors.textPrimary}]}>{`~${travel}`}</Text>
            <Text style={[styles.meta, {color: colors.textSecondary}]}>{`${km}  ·  ${copy.arrival} ${arrival}`}</Text>
            {props.others.map(item => (
              <Pressable
                key={`${item.distanceM}:${item.durationS}:${item.coordinates.length}`}
                accessibilityRole="button"
                onPress={() => {
                  setMenu(false);
                  props.onPick(item);
                }}
                style={[styles.alt, {backgroundColor: colors.accentSoft}]}>
                <Text style={[styles.altLabel, {color: colors.accent}]}>{`${copy.otherRoute} · ${formatTravel(item.durationS, copy.hours, copy.minutes)}`}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenu(false);
                props.onEnd();
              }}
              style={[styles.stop, {backgroundColor: colors.surfaceMuted}]}>
              <Text style={[styles.stopLabel, {color: colors.danger}]}>{copy.destStop}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function clockAfter(seconds: number): string {
  const date = new Date(Date.now() + Math.max(0, seconds) * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  wrap: {gap: 6},
  head: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  time: {color: '#1C1430', fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.4},
  km: {color: '#8E879C', fontSize: 16, lineHeight: 22, fontWeight: '600', marginBottom: 4},
  roads: {color: '#1C1430', fontSize: 16, lineHeight: 21, fontWeight: '500'},
  note: {color: '#8E879C', fontSize: 14, lineHeight: 18, fontWeight: '500'},
  meta: {color: '#6E657F', fontSize: 14, fontWeight: '600'},
  actions: {flexDirection: 'row', gap: 10, marginTop: 8},
  postpone: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#E6E6EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postponeLabel: {color: '#1C1430', fontSize: 17, fontWeight: '600'},
  goWrap: {flex: 1.25},
  go: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#5AA9FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  goFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#0B6FE8',
  },
  goLabel: {color: '#FFFFFF', fontSize: 18, fontWeight: '700', zIndex: 1},
  eta: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  etaTime: {fontSize: 20, fontWeight: '800'},
  etaKm: {fontSize: 16, fontWeight: '700'},
  menuFill: {flex: 1, justifyContent: 'flex-end'},
  scrim: {...StyleSheet.absoluteFill},
  menu: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 6},
  stop: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  stopLabel: {fontSize: 17, fontWeight: '700'},
  driveLine: {fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.4},
  alt: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  altLabel: {fontSize: 16, fontWeight: '700'},
});
