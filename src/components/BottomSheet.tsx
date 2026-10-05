import type {ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';

type Props = {
  children: ReactNode;
  aboveTabs?: boolean;
  light?: boolean;
  lift?: number;
};

export function BottomSheet({children, aboveTabs, light, lift = 0}: Props) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = lift > 0 ? lift + 8 : aboveTabs ? Math.max(insets.bottom, 12) + 84 : 12;
  const sheetColor = {
    backgroundColor: light ? 'rgba(244,241,236,0.96)' : colors.glass,
    borderColor: light ? 'transparent' : colors.border,
  };
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={[styles.wrap, {bottom}]}>
      <View style={[styles.sheet, sheetColor]}>
        <View style={[styles.handle, {backgroundColor: colors.border}]} />
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
});
