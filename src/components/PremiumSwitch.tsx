import {useEffect} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

const OFF = '#E4DCF2';
const ON = '#6B4EE0';

export function PremiumSwitch({value, onChange, disabled}: Props) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, {damping: 16, stiffness: 220, mass: 0.6});
  }, [progress, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [OFF, ON]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: interpolate(progress.value, [0, 1], [3, 25])},
      {scale: interpolate(progress.value, [0, 0.5, 1], [1, 0.92, 1])},
    ],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{checked: value, disabled: Boolean(disabled)}}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={disabled ? styles.dim : null}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 56,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1430',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
  },
  dim: {opacity: 0.45},
});
