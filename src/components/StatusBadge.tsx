import {StyleSheet, Text, View} from 'react-native';

import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
};

export function StatusBadge({label, value, tone}: Props) {
  const {colors} = useTheme();
  const color =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.textMuted;
  return (
    <View style={[styles.row, {backgroundColor: colors.surface}]}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <View style={styles.copy}>
        <Text style={[type.caption, {color: colors.textMuted}]}>{label}</Text>
        <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    padding: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
