import {Animated, Easing, Pressable, StyleSheet, Text, View} from 'react-native';
import {useEffect, useRef, useState} from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';

import {useSessionStore} from '../store/sessionStore';
import {useTheme} from '../theme/ThemeProvider';

const HUD_HIDE_MS = 20_000;
const HUD_SLIDE = 120;

export function tabBarCanHide(driving: boolean, tab: string | undefined): boolean {
  return driving && tab === 'Map';
}

export function FloatingTabBar({state, descriptors, navigation, insets}: BottomTabBarProps) {
  const {colors} = useTheme();
  const driving = useSessionStore(store => store.driving);
  const wake = useSessionStore(store => store.hudWake);
  const tab = state.routes[state.index]?.name;
  const canHide = tabBarCanHide(driving, tab);
  const [shown, setShown] = useState(true);
  const hide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setShown(true);
    Animated.timing(hide, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (!canHide) {
      return;
    }
    const timer = setTimeout(() => {
      setShown(false);
      Animated.timing(hide, {
        toValue: 1,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, HUD_HIDE_MS);
    return () => clearTimeout(timer);
  }, [canHide, hide, wake]);

  return (
    <Animated.View
      pointerEvents={canHide && !shown ? 'none' : 'box-none'}
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          opacity: hide.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
          transform: [{translateY: hide.interpolate({inputRange: [0, 1], outputRange: [0, HUD_SLIDE]})}],
        },
      ]}>
      <View style={[styles.pill, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const tint = focused ? colors.accent : colors.textPrimary;
          const title = descriptors[route.key].options.title ?? route.name;
          const cutout = focused ? colors.surfaceMuted : colors.surface;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? {selected: true} : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.item, focused ? [styles.itemOn, {backgroundColor: colors.surfaceMuted}] : null]}>
              <TabGlyph name={route.name} color={tint} cutout={cutout} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.label, {color: tint}]}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

function TabGlyph({name, color, cutout}: {name: string; color: string; cutout: string}) {
  if (name === 'Trips') {
    return <HistoryGlyph color={color} cutout={cutout} />;
  }
  if (name === 'Settings') {
    return <GearGlyph color={color} cutout={cutout} />;
  }
  return <MapGlyph color={color} />;
}

function MapGlyph({color}: {color: string}) {
  return (
    <View style={styles.map}>
      <View style={[styles.fold, styles.foldLeft, {backgroundColor: color}]} />
      <View style={[styles.fold, styles.foldMid, {backgroundColor: color}]} />
      <View style={[styles.fold, styles.foldRight, {backgroundColor: color}]} />
    </View>
  );
}

function HistoryGlyph({color, cutout}: {color: string; cutout: string}) {
  return (
    <View style={styles.clock}>
      <View style={[styles.clockRing, {borderColor: color}]} />
      <View style={[styles.clockGap, {backgroundColor: cutout}]} />
      <View style={[styles.arrowSpin, {borderRightColor: color}]} />
      <View style={styles.handUp}>
        <View style={[styles.handLong, {backgroundColor: color}]} />
      </View>
      <View style={styles.handDown}>
        <View style={[styles.handShort, {backgroundColor: color}]} />
      </View>
    </View>
  );
}

function GearGlyph({color, cutout}: {color: string; cutout: string}) {
  return (
    <View style={styles.gear}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(degree => (
        <View key={degree} style={[styles.toothSpin, {transform: [{rotate: `${degree}deg`}]}]}>
          <View style={[styles.tooth, {backgroundColor: color}]} />
        </View>
      ))}
      <View style={[styles.gearBody, {backgroundColor: color}]} />
      <View style={[styles.gearHole, {backgroundColor: cutout}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  pill: {
    width: 340,
    flexDirection: 'row',
    borderRadius: 34,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    minHeight: 54,
    justifyContent: 'center',
    borderRadius: 26,
  },
  itemOn: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  map: {
    width: 22,
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
  },
  fold: {
    width: 6,
    height: 14,
    borderRadius: 1.2,
  },
  foldLeft: {transform: [{skewY: '-24deg'}]},
  foldMid: {transform: [{skewY: '24deg'}]},
  foldRight: {transform: [{skewY: '-24deg'}]},
  clock: {
    width: 22,
    height: 22,
  },
  clockRing: {
    position: 'absolute',
    left: 2,
    top: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.8,
  },
  clockGap: {
    position: 'absolute',
    left: 0,
    top: 12,
    width: 8,
    height: 6,
  },
  arrowSpin: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: 0,
    height: 0,
    borderTopWidth: 3.2,
    borderBottomWidth: 3.2,
    borderRightWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  handUp: {
    position: 'absolute',
    left: 2,
    top: 1,
    width: 18,
    height: 18,
    alignItems: 'center',
  },
  handDown: {
    position: 'absolute',
    left: 2,
    top: 1,
    width: 18,
    height: 18,
    alignItems: 'center',
    transform: [{rotate: '150deg'}],
  },
  handLong: {
    width: 1.6,
    height: 6,
    borderRadius: 1,
    marginTop: 2.5,
  },
  handShort: {
    width: 1.6,
    height: 4.5,
    borderRadius: 1,
    marginTop: 4.5,
  },
  gear: {
    width: 24,
    height: 24,
  },
  toothSpin: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
  },
  tooth: {
    width: 5.4,
    height: 6.2,
    borderRadius: 2.4,
    marginTop: 0.4,
  },
  gearBody: {
    position: 'absolute',
    width: 16.5,
    height: 16.5,
    borderRadius: 8.25,
    left: 3.75,
    top: 3.75,
  },
  gearHole: {
    position: 'absolute',
    width: 7.2,
    height: 7.2,
    borderRadius: 3.6,
    left: 8.4,
    top: 8.4,
  },
});
