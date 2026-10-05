import {Text, View} from 'react-native';

import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
import {formatSpeed, speedUnitLabel} from '../utils/format';

type Props = {
  metersPerSecond: number | null;
  unit: 'kmh' | 'mph';
};

export function SpeedCard({metersPerSecond, unit}: Props) {
  const {colors} = useTheme();
  return (
    <View>
      <Text style={[type.speed, {color: colors.textPrimary}]}>
        {metersPerSecond == null ? '—' : formatSpeed(metersPerSecond, unit)}
      </Text>
      <Text style={[type.caption, {color: colors.textSecondary}]}>{speedUnitLabel(unit)}</Text>
    </View>
  );
}
