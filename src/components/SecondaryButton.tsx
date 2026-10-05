import {Pressable, StyleSheet, Text} from 'react-native';

import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  title: string;
  onPress: () => void;
};

export function SecondaryButton({title, onPress}: Props) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {borderColor: colors.accent, opacity: pressed ? 0.7 : 1},
      ]}>
      <Text style={[type.button, {color: colors.accent}]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
