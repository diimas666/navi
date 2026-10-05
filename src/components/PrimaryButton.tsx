import {useEffect} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {radius} from '../theme/radius';
import {type} from '../theme/typography';

const flow = require('../assets/button-flow.png');

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({title, onPress, disabled}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [styles.button, disabled ? styles.dim : null, pressed ? styles.pressed : null]}>
      <Flow paused={disabled} />
      <Text style={[type.button, styles.label]}>{title}</Text>
    </Pressable>
  );
}

function Flow({paused}: {paused?: boolean}) {
  const travel = useSharedValue(0);
  const span = useSharedValue(280);

  useEffect(() => {
    if (paused) {
      travel.value = 0;
      return;
    }
    travel.value = withRepeat(withTiming(1, {duration: 3200, easing: Easing.inOut(Easing.cubic)}), -1, true);
  }, [paused, travel]);

  const wash = useAnimatedStyle(() => ({
    transform: [{translateX: -travel.value * span.value}],
  }));

  return (
    <View
      pointerEvents="none"
      style={styles.flow}
      onLayout={event => {
        span.value = event.nativeEvent.layout.width;
      }}>
      <Animated.View style={[styles.band, wash]}>
        <Image source={flow} resizeMode="stretch" style={styles.tile} />
        <Image source={flow} resizeMode="stretch" style={styles.tile} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
    backgroundColor: '#0C0912',
  },
  dim: {opacity: 0.45},
  pressed: {opacity: 0.84},
  label: {
    color: '#F7F4FF',
    textAlign: 'center',
    zIndex: 1,
  },
  flow: {
    ...StyleSheet.absoluteFill,
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '200%',
    flexDirection: 'row',
  },
  tile: {
    width: '50%',
    height: '100%',
  },
});
