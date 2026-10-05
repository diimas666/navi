import {StyleSheet, Text, View} from 'react-native';

import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  active: boolean;
  untrusted: boolean;
};

export function DRStatus({active, untrusted}: Props) {
  const {colors} = useTheme();
  const label = untrusted ? 'GPS UNTRUSTED' : active ? 'DR ACTIVE' : 'GPS + Dead Reckoning';
  return (
    <View style={[styles.badge, {backgroundColor: active ? colors.surfaceWarning : colors.surfaceTeal}]}>
      <Text style={[type.caption, {color: active ? colors.warning : colors.accent}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
