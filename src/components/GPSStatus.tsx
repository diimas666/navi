import {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type {TrustLevel} from '../models/domain';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
import {trustLabel} from '../store/sessionStore';

type Props = {
  trust: TrustLevel;
};

export function GPSStatus({trust}: Props) {
  const {colors} = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, {duration: 800}), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({opacity: pulse.value}));
  const color =
    trust === 'trusted' ? colors.success : trust === 'degraded' ? colors.warning : colors.danger;
  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, style, {backgroundColor: color}]} />
      <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>GPS · {trustLabel(trust)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
