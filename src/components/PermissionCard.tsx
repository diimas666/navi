import {StyleSheet, Text, View} from 'react-native';

import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  title: string;
  body: string;
};

export function PermissionCard({title, body}: Props) {
  const {colors} = useTheme();
  return (
    <View style={[styles.card, {backgroundColor: colors.surfaceTeal}]}>
      <Text style={[type.headline, {color: colors.textPrimary}]}>{title}</Text>
      <Text style={[type.body, {color: colors.textSecondary}]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 18,
    gap: 8,
  },
});
