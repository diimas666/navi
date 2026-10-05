import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {NativeOBDDevice} from '../native/NativeOBDManager';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  device: NativeOBDDevice;
  connected: boolean;
  connectedLabel: string;
  onPress: () => void;
};

export function OBDDeviceCard({device, connected, connectedLabel, onPress}: Props) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, {backgroundColor: colors.surface, borderColor: connected ? colors.accent : colors.border}]}>
      <View style={styles.copy}>
        <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{device.name}</Text>
        <Text style={[type.caption, {color: colors.textSecondary}]}>
          {device.transport === 'wifi' ? 'Wi-Fi' : 'Bluetooth LE'}
          {connected ? ` · ${connectedLabel}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  copy: {
    gap: 4,
  },
});
