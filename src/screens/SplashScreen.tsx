import {useEffect} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {NaviMark} from '../components/NaviMark';
import type {RootStackParamList} from '../navigation/types';
import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({navigation}: Props) {
  const {colors} = useTheme();
  const hydrated = useSettingsStore(state => state.hydrated);
  const onboarded = useSettingsStore(state => state.onboarded);
  const copy = uiCopy(useSettingsStore(state => state.language));

  const leave = () => {
    if (!navigation.isFocused() || !useSettingsStore.getState().hydrated) {
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{name: useSettingsStore.getState().onboarded ? 'Main' : 'Onboarding'}],
    });
  };

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const timer = setTimeout(() => {
      if (navigation.isFocused()) {
        navigation.reset({
          index: 0,
          routes: [{name: onboarded ? 'Main' : 'Onboarding'}],
        });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [hydrated, navigation, onboarded]);

  return (
    <Pressable accessibilityRole="button" onPress={leave} style={[styles.screen, {backgroundColor: colors.background}]}>
      <Animated.View entering={FadeIn.duration(500)}>
        <NaviMark width={196} height={196} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(180)} style={[type.display, {color: colors.textPrimary}]}>
        Navi
      </Animated.Text>
      <Text style={[type.caption, {color: colors.textSecondary}]}>{copy.splash}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
